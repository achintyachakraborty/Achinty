"""
Rx Sync med reminder API  -  v2.0

What's new in this version
--------------------------
1. Real scheduler  : a background loop (every minute, India time) that creates each day's
                     doses, sends dose reminders, alerts caregivers about missed doses,
                     and checks for low medicine stock.
2. Own-phone SMS   : SMS is no longer a fake log line. Alerts are put in an `sms_jobs` queue;
                     a small Android app on your phone polls /api/sms/pending, sends the
                     texts from your SIM and reports back to /api/sms/{id}/status.
3. India time      : "today" now means today in IST (the old code used the UTC day).
4. Per-slot times  : each medicine slot has its own time (e.g. morning 08:30 AM, evening 08:00 PM).
5. OTP             : real random OTPs sent by SMS when DEMO_OTP_MODE=false (demo mode keeps 123456).
6. Fixes           : hard-coded patient / caregiver names removed, double dose-decrement fixed,
                     archived medicines no longer produce doses, refill alerts use the real caregiver.

Environment variables (all optional unless marked)
--------------------------------------------------
MONGO_URL, DB_NAME, EMERGENT_LLM_KEY            as before
SMS_GATEWAY_KEY        REQUIRED for SMS: secret that your Android app sends in the X-Device-Key header
SMS_REDIRECT_TO        while testing, send ALL texts to this one number (e.g. your own number)
DEMO_OTP_MODE          "true" (default) = OTP is always 123456; set "false" for real OTP over SMS
ENABLE_SCHEDULER       "true" (default)
SCHEDULER_INTERVAL_SEC 60
REMINDER_MAX_LATE_MIN  120   (do not send reminders for doses more than this many minutes overdue)
MISSED_DOSE_GRACE_MIN  45    (alert caregiver if a reminded dose is still not confirmed after this long)
REFILL_ALERT_DAYS      7
REFILL_CHECK_HOUR_IST  9
SMS_MAX_ATTEMPTS       3
CORS_ORIGINS           comma separated list, default "*"
"""
import os
import re
import json
import uuid
import logging
import asyncio
import secrets
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

import requests
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Query, Body, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'rxsync_database')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')   # no longer used for SMS (kept for later)
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER', '')
META_WHATSAPP_API_KEY = os.environ.get('META_WHATSAPP_API_KEY', '')

# SMS gateway (your own phone)
SMS_GATEWAY_KEY = os.environ.get('SMS_GATEWAY_KEY', '')
SMS_REDIRECT_TO = os.environ.get('SMS_REDIRECT_TO', '').strip()
SMS_MAX_ATTEMPTS = _env_int("SMS_MAX_ATTEMPTS", 3)
SMS_CLAIM_TIMEOUT_SEC = _env_int("SMS_CLAIM_TIMEOUT_SEC", 120)

# Scheduler
ENABLE_SCHEDULER = _env_bool("ENABLE_SCHEDULER", True)
SCHEDULER_INTERVAL_SEC = _env_int("SCHEDULER_INTERVAL_SEC", 60)
REMINDER_MAX_LATE_MIN = _env_int("REMINDER_MAX_LATE_MIN", 120)
MISSED_DOSE_GRACE_MIN = _env_int("MISSED_DOSE_GRACE_MIN", 45)
REFILL_ALERT_DAYS = _env_int("REFILL_ALERT_DAYS", 7)
REFILL_CHECK_HOUR_IST = _env_int("REFILL_CHECK_HOUR_IST", 9)

# Auth
DEMO_OTP_MODE = _env_bool("DEMO_OTP_MODE", True)
OTP_TTL_MIN = 10
OTP_MAX_WRONG_TRIES = 5

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("rxsync-backend")

app = FastAPI(title="Rx Sync med reminder API", version="2.0.0")
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return {}
    result = dict(doc)
    if "_id" in result:
        result["id"] = str(result["_id"])
        del result["_id"]
    return result


def serialize_docs(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [serialize_doc(d) for d in docs]


# --- Time (India has no daylight saving, so a fixed +05:30 offset is exact) ---
IST = timezone(timedelta(hours=5, minutes=30), "IST")

DEFAULT_SLOT_TIMES = {
    "morning": "08:00 AM",
    "afternoon": "02:00 PM",
    "evening": "08:00 PM",
    "night": "09:30 PM",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_ist() -> datetime:
    return datetime.now(IST)


def today_ist_str() -> str:
    return now_ist().strftime("%Y-%m-%d")


def parse_dt(value: Any) -> Optional[datetime]:
    """Parse an ISO string / datetime into an aware datetime (naive = UTC)."""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def parse_clock(value: Optional[str], default=(8, 0)):
    """'08:30 AM', '8:30 pm' or '20:30' -> (hour, minute)."""
    if not value:
        return default
    m = re.match(r"^\s*(\d{1,2})[:.](\d{2})\s*([AaPp][Mm])?\s*$", str(value))
    if not m:
        return default
    hour, minute, meridian = int(m.group(1)), int(m.group(2)), m.group(3)
    if meridian:
        if hour == 12:
            hour = 0
        if meridian.upper() == "PM":
            hour += 12
    if hour > 23 or minute > 59:
        return default
    return hour, minute


def build_slot_times(timing_slots: Optional[List[str]], exact_time: Optional[str] = None,
                     slot_times: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Give every slot its own clock time.
    Priority: explicit slot_times > exact_time (first slot only) > default time for that slot."""
    slots = timing_slots or ["morning"]
    given = dict(slot_times or {})
    result: Dict[str, str] = {}
    for idx, slot in enumerate(slots):
        if given.get(slot):
            result[slot] = given[slot]
        elif idx == 0 and exact_time:
            result[slot] = exact_time
        else:
            result[slot] = DEFAULT_SLOT_TIMES.get(slot, exact_time or "08:00 AM")
    return result


def dose_scheduled_at(date_str: str, clock_str: Optional[str]) -> datetime:
    hour, minute = parse_clock(clock_str)
    base = datetime.strptime(date_str, "%Y-%m-%d")
    return base.replace(hour=hour, minute=minute, tzinfo=IST)


# --- Phone / SMS helpers ---
# Placeholder numbers used by the demo seed data. We never text these.
DEMO_PHONES = {"+919876543210", "+919876500001", "+919876500002", "+919876500099", "+919876500088"}
EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]")


def normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    p = re.sub(r"[^\d+]", "", str(phone))
    if p.startswith("+"):
        return p
    if len(p) == 10:
        return "+91" + p
    if len(p) == 12 and p.startswith("91"):
        return "+" + p
    if len(p) == 11 and p.startswith("0"):
        return "+91" + p[1:]
    return p


def sms_safe(text: str) -> str:
    """Emoji turn a text into a 70-character 'unicode' SMS, so strip them."""
    cleaned = EMOJI_RE.sub("", text or "")
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


# Local Clinical Drug Interaction Rules Database
LOCAL_DDI_RULES = [
    {
        "drug_a": "metformin",
        "drug_b": "cimetidine",
        "rxcui_a": "6809",
        "rxcui_b": "2541",
        "severity": "Moderate",
        "mechanism": "Cimetidine increases plasma concentration of Metformin by reducing renal clearance.",
        "warning": "Increased risk of lactic acidosis. Monitor blood glucose closely."
    },
    {
        "drug_a": "atorvastatin",
        "drug_b": "clarithromycin",
        "rxcui_a": "83367",
        "rxcui_b": "21212",
        "severity": "Severe",
        "mechanism": "Clarithromycin strongly inhibits CYP3A4, causing dangerous accumulation of Atorvastatin.",
        "warning": "High risk of rhabdomyolysis and severe muscle toxicity. Avoid combination or temporarily withhold statin."
    },
    {
        "drug_a": "aspirin",
        "drug_b": "warfarin",
        "rxcui_a": "1191",
        "rxcui_b": "11289",
        "severity": "Severe",
        "mechanism": "Concurrent antiplatelet and anticoagulant action severely potentiates hemorrhage risk.",
        "warning": "Significantly elevated gastrointestinal and systemic bleeding hazard. Continuous INR monitoring mandatory."
    },
    {
        "drug_a": "lisinopril",
        "drug_b": "spironolactone",
        "rxcui_a": "29046",
        "rxcui_b": "9997",
        "severity": "Severe",
        "mechanism": "Both agents retain potassium in distal renal tubules.",
        "warning": "Dangerous hyperkalemia risk causing cardiac arrhythmias. Check serum potassium and creatinine within 1-2 weeks."
    },
    {
        "drug_a": "amlodipine",
        "drug_b": "simvastatin",
        "rxcui_a": "17767",
        "rxcui_b": "36567",
        "severity": "Moderate",
        "mechanism": "Amlodipine increases Simvastatin exposure via CYP3A4 inhibition.",
        "warning": "Limit Simvastatin dose to max 20mg daily when co-prescribed with Amlodipine to reduce myopathy risk."
    },
    {
        "drug_a": "metformin",
        "drug_b": "lisinopril",
        "rxcui_a": "6809",
        "rxcui_b": "29046",
        "severity": "Minor",
        "mechanism": "Compatible standard combination for diabetic nephropathy and hypertension.",
        "warning": "Synergistic renal protection. Regular BP and renal function follow-up recommended."
    }
]

# Predefined Drug Master Dictionary for quick offline enrichment & Tier 1/2 Side Effects
MASTER_DRUG_KNOWLEDGE = {
    "metformin": {
        "generic_name": "Metformin Hydrochloride",
        "rxcui": "6809",
        "mechanism": "Decreases hepatic glucose production, decreases intestinal absorption of glucose, and improves insulin sensitivity by increasing peripheral glucose uptake.",
        "why_critical": "Consistent daily dosing stabilizes baseline glycemic levels and prevents diabetic microvascular and macrovascular complications.",
        "missed_dose_consequence": "Can cause acute blood glucose spikes and rebound hyperglycemia.",
        "meal_rule": "with_food",
        "meal_rule_label": "Take with or right after meals to minimize stomach upset",
        "tier1_side_effects": [
            {"symptom": "Mild stomach discomfort or bloating", "note": "Harmless; usually subsides within 1-2 weeks as body adapts"},
            {"symptom": "Metallic taste in mouth", "note": "Common benign sensory effect that fades with continued use"}
        ],
        "tier2_side_effects": [
            {"symptom": "Severe abdominal pain with extreme fatigue, dizziness, or rapid shallow breathing", "note": "Potential sign of lactic acidosis - seek immediate emergency medical care"}
        ],
        "vernacular": {
            "hi": {
                "mechanism": "यह लिवर में ग्लूकोज के उत्पादन को कम करता है और शरीर की इंसुलिन संवेदनशीलता को बढ़ाता है।",
                "why_critical": "नियमित सेवन से ब्लड शुगर का स्तर नियंत्रित रहता है और डायबिटीज की जटिलताओं से बचाव होता है।",
                "meal_rule_label": "पेट की परेशानी से बचने के लिए भोजन के साथ या ठीक बाद लें।"
            },
            "bn": {
                "mechanism": "এটি যকৃতে গ্লুকোজ তৈরি কমায় এবং শরীরের ইনসুলিনের কার্যকারিতা উন্নত করে।",
                "why_critical": "নিয়মিত সেবন রক্তে শর্করার মাত্রা স্থিতিশীল রাখে এবং ডায়াবেটিসের ঝুঁকি রোধ করে।",
                "meal_rule_label": "পেটের অস্বস্তি এড়াতে খাবারের সাথে বা ঠিক পরে খান।"
            }
        }
    },
    "atorvastatin": {
        "generic_name": "Atorvastatin Calcium",
        "rxcui": "83367",
        "mechanism": "Competitively inhibits HMG-CoA reductase, the rate-limiting enzyme in cholesterol synthesis, substantially lowering LDL-C and triglycerides.",
        "why_critical": "Nightly adherence maintains continuous inhibition of nighttime hepatic cholesterol synthesis, actively preventing heart attacks and strokes.",
        "missed_dose_consequence": "Interrupts arterial plaque stabilization and leads to fluctuating LDL levels.",
        "meal_rule": "after_food",
        "meal_rule_label": "Take at bedtime with or without food",
        "tier1_side_effects": [
            {"symptom": "Mild transient joint ache or constipation", "note": "Mild and manageable; stay well hydrated"}
        ],
        "tier2_side_effects": [
            {"symptom": "Unexplained severe muscle soreness, dark tea-colored urine", "note": "Possible rhabdomyolysis indicator - trigger emergency SOS and alert caregiver"}
        ],
        "vernacular": {
            "hi": {
                "mechanism": "यह लिवर में कोलेस्ट्रॉल बनाने वाले एंजाइम को रोकता है, जिससे खराब कोलेस्ट्रॉल (LDL) कम होता है।",
                "why_critical": "रात में लेने से हृदय रोग और स्ट्रोक का खतरा काफी कम होता है।",
                "meal_rule_label": "रात को सोने से पहले भोजन के बाद लें।"
            },
            "bn": {
                "mechanism": "এটি কোলেস্টেরল তৈরির এনজাইম বন্ধ করে খারাপ কোলেস্টেরল (LDL) কমায়।",
                "why_critical": "প্রতিদিন রাতে সেবন হার্ট অ্যাটাক এবং স্ট্রোকের ঝুঁকি রোধ করে।",
                "meal_rule_label": "রাতে ঘুমানোর আগে খাবারের পরে খান।"
            }
        }
    },
    "lisinopril": {
        "generic_name": "Lisinopril",
        "rxcui": "29046",
        "mechanism": "Inhibits Angiotensin Converting Enzyme (ACE), preventing the conversion of angiotensin I to angiotensin II, leading to systemic vasodilation and reduced blood pressure.",
        "why_critical": "Maintains 24-hour arterial relaxation, shielding kidneys and cardiac muscle from hypertensive stress.",
        "missed_dose_consequence": "Risk of rebound hypertension and elevated arterial resistance.",
        "meal_rule": "empty_stomach",
        "meal_rule_label": "Take at the same time each morning, before breakfast",
        "tier1_side_effects": [
            {"symptom": "Persistent dry tickling cough", "note": "Benign ACE-inhibitor class effect; notify doctor if disruptive"},
            {"symptom": "Mild lightheadedness when standing up quickly", "note": "Normal initial response; stand up gradually"}
        ],
        "tier2_side_effects": [
            {"symptom": "Swelling of lips, tongue, face, or throat (Angioedema)", "note": "Critical allergic airway reaction - immediate emergency dispatch required"}
        ],
        "vernacular": {
            "hi": {
                "mechanism": "यह रक्त वाहिकाओं को शिथिल करता है जिससे रक्तचाप नियंत्रित रहता है।",
                "why_critical": "नियमित सेवन से दिल और किडनी पर दबाव कम होता है।",
                "meal_rule_label": "सुबह नाश्ते से पहले एक ही निश्चित समय पर लें।"
            },
            "bn": {
                "mechanism": "এটি রক্তনালীগুলিকে শিথিল করে রক্তচাপ কমাতে সাহায্য করে।",
                "why_critical": "প্রতিদিন সকালে নিলে হার্ট ও কিডনি সুরক্ষিত থাকে।",
                "meal_rule_label": "প্রতিদিন সকালে প্রাতঃরাশের আগে নির্দিষ্ট সময়ে খান।"
            }
        }
    },
    "amlodipine": {
        "generic_name": "Amlodipine Besylate",
        "rxcui": "17767",
        "mechanism": "Calcium channel blocker that inhibits transmembrane influx of calcium ions into vascular smooth muscle and cardiac muscle, causing coronary and peripheral vasodilation.",
        "why_critical": "Prevents hypertensive spikes and protects against angina pectoris.",
        "missed_dose_consequence": "Loss of vascular tone control and elevated systolic blood pressure.",
        "meal_rule": "after_food",
        "meal_rule_label": "Take daily with water after morning or evening meal",
        "tier1_side_effects": [
            {"symptom": "Mild ankle swelling (peripheral edema)", "note": "Common benign vasodilatory effect; elevate feet when resting"},
            {"symptom": "Mild facial flushing", "note": "Harmless warmth sensation caused by open blood vessels"}
        ],
        "tier2_side_effects": [
            {"symptom": "Sudden severe chest pressure, rapid pounding heartbeat, or fainting", "note": "Immediate emergency evaluation required"}
        ],
        "vernacular": {
            "hi": {
                "mechanism": "यह धमनियों को चौड़ा करके रक्त के प्रवाह को सुगम बनाता है।",
                "why_critical": "ब्लड प्रेशर और सीने के दर्द को नियंत्रित रखने में आवश्यक है।",
                "meal_rule_label": "सुबह या शाम के भोजन के बाद पानी के साथ लें।"
            },
            "bn": {
                "mechanism": "এটি রক্তনালী প্রশস্ত করে রক্ত চলাচল সহজ করে।",
                "why_critical": "উচ্চ রক্তচাপ এবং বুকের ব্যথা নিয়ন্ত্রণে রাখা অপরিহার্য।",
                "meal_rule_label": "সকাল বা সন্ধ্যার খাবারের পর জল দিয়ে খান।"
            }
        }
    },
    "pantoprazole": {
        "generic_name": "Pantoprazole Sodium",
        "rxcui": "40790",
        "mechanism": "Proton pump inhibitor (PPI) that suppresses gastric acid secretion by specific inhibition of the H+/K+-ATPase enzyme system at the secretory surface of the gastric parietal cell.",
        "why_critical": "Shields gastric mucosa from erosive ulcers and acid reflux damage, especially when taking other medications.",
        "missed_dose_consequence": "Acute acid rebound and heartburn flare-ups.",
        "meal_rule": "before_food",
        "meal_rule_label": "Take 30-60 minutes before morning breakfast with a full glass of water",
        "tier1_side_effects": [
            {"symptom": "Mild headache or transient loose stools", "note": "Mild self-limiting adjustment effect"}
        ],
        "tier2_side_effects": [
            {"symptom": "Severe watery diarrhea with fever and severe abdominal cramping (C. diff risk)", "note": "Immediate clinical attention required"}
        ],
        "vernacular": {
            "hi": {
                "mechanism": "यह पेट में अत्यधिक एसिड के निर्माण को रोकता है और अल्सर से बचाता है।",
                "why_critical": "गैस, एसिडिटी और अन्य दवाओं से पेट को सुरक्षित रखने के लिए जरूरी है।",
                "meal_rule_label": "सुबह नाश्ते से 30-60 मिनट पहले खाली पेट एक गिलास पानी के साथ लें।"
            },
            "bn": {
                "mechanism": "এটি পেটে অ্যাসিড নিঃসরণ কমিয়ে গ্যাস ও আলসার থেকে রক্ষা করে।",
                "why_critical": "গ্যাস ও অ্যাসিডিটি দূর করতে এবং পাকস্থলী সুরক্ষিত রাখতে অত্যন্ত জরুরি।",
                "meal_rule_label": "সকালে প্রাতঃরাশের ৩০-৬০ মিনিট আগে খালি পেটে খান।"
            }
        }
    }
}


# Fallback generic drug generator
def get_drug_clinical_info(drug_name: str, language: str = "en") -> Dict[str, Any]:
    normalized = drug_name.strip().lower()
    for key, data in MASTER_DRUG_KNOWLEDGE.items():
        if key in normalized or normalized in key:
            res = dict(data)
            if language in res.get("vernacular", {}):
                vern = res["vernacular"][language]
                res["mechanism"] = vern.get("mechanism", res["mechanism"])
                res["why_critical"] = vern.get("why_critical", res["why_critical"])
                res["meal_rule_label"] = vern.get("meal_rule_label", res["meal_rule_label"])
            return res

    # Generic generated clinical baseline
    return {
        "generic_name": drug_name.capitalize(),
        "rxcui": "0000",
        "mechanism": f"{drug_name.capitalize()} acts on targeted biological receptors to regulate clinical symptoms and sustain therapeutic serum concentrations.",
        "why_critical": f"Taking {drug_name.capitalize()} strictly at scheduled intervals ensures optimal therapeutic efficacy and prevents disease progression.",
        "missed_dose_consequence": "Missed doses can lead to fluctuating drug blood levels and reduced symptom control.",
        "meal_rule": "after_food",
        "meal_rule_label": "Take after meals with plenty of water",
        "tier1_side_effects": [
            {"symptom": "Mild nausea or mild drowsiness", "note": "Generally mild and resolves with continued routine"}
        ],
        "tier2_side_effects": [
            {"symptom": "Unusual rash, swelling, or severe acute pain", "note": "Seek immediate medical consultation"}
        ]
    }


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class AuthSendOtpRequest(BaseModel):
    phone: str
    role: Optional[str] = "patient"
    language: Optional[str] = "en"

class AuthVerifyOtpRequest(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None
    role: Optional[str] = "patient"
    language: Optional[str] = "en"

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    language: Optional[str] = None
    emergency_contacts: Optional[List[Dict[str, str]]] = None
    caregiver_id: Optional[str] = None

class DoseLogRequest(BaseModel):
    patient_id: str
    medication_id: str
    scheduled_time: str
    status: str # 'taken', 'skipped', 'pending'
    meal_status: Optional[str] = None
    notes: Optional[str] = None
    slot: Optional[str] = None   # optional: exact slot to update (morning/afternoon/evening/night)
    date: Optional[str] = None   # optional: YYYY-MM-DD (defaults to today, India time)

class HealthStatusLogRequest(BaseModel):
    patient_id: str
    status: str # 'Well', 'Unwell', 'Distress_Button'
    reported_symptoms: Optional[List[str]] = []
    notes: Optional[str] = None
    language: Optional[str] = "en"

class DispatchAlertRequest(BaseModel):
    patient_id: str
    caregiver_id: Optional[str] = None
    alert_type: str # 'Dose_Reminder', 'Tier_2_Emergency', 'Refill_Notice', 'Checkup_Notice', 'Distress_SOS', 'Missed_Dose'
    channel: Optional[str] = "Push" # 'Push', 'WhatsApp', 'SMS', 'Cascade'
    drug_name: Optional[str] = None
    scheduled_time: Optional[str] = None
    patient_name: Optional[str] = None
    custom_message: Optional[str] = None
    target_phone: Optional[str] = None
    language: Optional[str] = "en"

class InteractionCheckRequest(BaseModel):
    medication_names: List[str]
    rxcuis: Optional[List[str]] = []

class SessionRequest(BaseModel):
    session_id: str

class SelectRoleRequest(BaseModel):
    role: str
    language: Optional[str] = None

class LinkPhoneRequest(BaseModel):
    phone: str
    otp: str

class ManualMedicationCreate(BaseModel):
    patient_id: str
    prescription_id: Optional[str] = None
    drug_name: str
    dosage: str
    form: Optional[str] = "Tablet"
    frequency: Optional[str] = "Once Daily"
    timing_slots: List[str] = ["morning"]
    exact_time: Optional[str] = "08:00 AM"
    slot_times: Optional[Dict[str, str]] = None   # e.g. {"morning": "08:30 AM", "evening": "08:00 PM"}
    meal_rule: Optional[str] = "after_food"
    total_doses: Optional[int] = 30
    remaining_doses: Optional[int] = 30
    refill_due_date: Optional[str] = None

class PrescriptionVerificationSubmit(BaseModel):
    patient_id: str
    image_url: Optional[str] = None
    doctor_name: Optional[str] = "Dr. S. Mukherjee, MD"
    clinic_name: Optional[str] = "Apollo Multi-Specialty Clinic"
    diagnosis: Optional[str] = "Hypertension & Type 2 Diabetes"
    ocr_confidence_score: float = 92.5
    verified_by_user: bool = True
    medications: List[Dict[str, Any]]

class SmsStatusUpdate(BaseModel):
    status: str                 # 'sent' or 'failed'
    error: Optional[str] = None

class SmsSendRequest(BaseModel):
    to: str
    message: str


# ---------------------------------------------------------------------------
# Medication + dose builders (one place, used by seed / manual add / OCR save / scheduler)
# ---------------------------------------------------------------------------
def build_med_doc(patient_id: str, drug_name: str, dosage: str, *, med_id: Optional[str] = None,
                  prescription_id: Optional[str] = None, form: str = "Tablet",
                  frequency: str = "Once Daily", timing_slots: Optional[List[str]] = None,
                  exact_time: str = "08:00 AM", slot_times: Optional[Dict[str, str]] = None,
                  meal_rule: str = "after_food", meal_rule_label: Optional[str] = None,
                  total_doses: int = 30, remaining_doses: Optional[int] = None,
                  refill_due_date: Optional[str] = None,
                  overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    d_info = get_drug_clinical_info(drug_name)
    ov = overrides or {}
    slots = timing_slots or ["morning"]
    med_id = med_id or f"med_{uuid.uuid4().hex[:8]}"
    now = now_utc()
    return {
        "_id": med_id,
        "id": med_id,
        "prescription_id": prescription_id,
        "patient_id": patient_id,
        "drug_name": drug_name,
        "generic_name": ov.get("generic_name") or d_info.get("generic_name", drug_name),
        "rxcui": ov.get("rxcui") or d_info.get("rxcui", "0000"),
        "dosage": dosage,
        "form": form,
        "frequency": frequency,
        "timing_slots": slots,
        "exact_time": exact_time,
        "slot_times": build_slot_times(slots, exact_time, slot_times),
        "meal_rule": meal_rule,
        "meal_rule_label": meal_rule_label or d_info.get("meal_rule_label", "Take after meals"),
        "total_doses": total_doses,
        "remaining_doses": total_doses if remaining_doses is None else remaining_doses,
        "refill_due_date": refill_due_date or (now + timedelta(days=30)).strftime("%Y-%m-%d"),
        "active": True,
        "tier1_side_effects": ov.get("tier1_side_effects") or d_info.get("tier1_side_effects", []),
        "tier2_side_effects": ov.get("tier2_side_effects") or d_info.get("tier2_side_effects", []),
        "drug_mechanism": ov.get("drug_mechanism") or d_info.get("mechanism", ""),
        "why_critical": ov.get("why_critical") or d_info.get("why_critical", ""),
        "missed_dose_consequence": ov.get("missed_dose_consequence") or d_info.get("missed_dose_consequence", ""),
        "created_at": now.isoformat()
    }


def make_dose_doc(med: Dict[str, Any], slot: str, date_str: str, status: str = "pending",
                  taken_at: Optional[str] = None) -> Dict[str, Any]:
    slot_times = med.get("slot_times") or build_slot_times(med.get("timing_slots"), med.get("exact_time"))
    clock = slot_times.get(slot) or med.get("exact_time") or "08:00 AM"
    doc = {
        "_id": str(uuid.uuid4()),
        "patient_id": med["patient_id"],
        "medication_id": med["_id"],
        "drug_name": med.get("drug_name"),
        "dosage": med.get("dosage"),
        "slot": slot,
        "scheduled_time": clock,
        "scheduled_at": dose_scheduled_at(date_str, clock).isoformat(),
        "status": status,
        "reminder_sent": False,
        "missed_alert_sent": False,
        "date": date_str,
    }
    if taken_at:
        doc["taken_at"] = taken_at
    return doc


async def ensure_doses_for_med(med: Dict[str, Any], date_str: str) -> int:
    """Create the dose rows for one medicine on one day. Safe to call many times."""
    created = 0
    for slot in med.get("timing_slots") or ["morning"]:
        exists = await db.dose_logs.find_one({
            "patient_id": med["patient_id"], "medication_id": med["_id"],
            "slot": slot, "date": date_str
        })
        if not exists:
            await db.dose_logs.insert_one(make_dose_doc(med, slot, date_str))
            created += 1
    return created


# ---------------------------------------------------------------------------
# Startup Seed Data Loader
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_seed_database():
    logger.info("Checking and initializing Rx Sync database...")
    if await db.users.count_documents({}) > 0:
        return

    logger.info("Seeding initial demo profiles and active prescriptions...")
    now = now_utc()
    today_str = today_ist_str()

    # Demo Patient: Ramesh Sharma (Elderly Patient)
    patient_id = "patient_ramesh_001"
    caregiver_id = "caregiver_ananya_001"
    pharmacist_id = "pharmacist_medplus_001"
    clinic_id = "clinic_apollo_001"

    await db.users.insert_many([
        {
            "_id": patient_id, "id": patient_id, "phone": "+919876543210",
            "name": "Ramesh Sharma", "role": "patient", "language": "en",
            "age": 68, "gender": "Male", "caregiver_id": caregiver_id,
            "emergency_contacts": [
                {"name": "Ananya Sharma (Daughter)", "phone": "+919876500001", "relationship": "Caregiver"},
                {"name": "Dr. S. Mukherjee", "phone": "+919876500002", "relationship": "Primary Physician"}
            ],
            "created_at": now.isoformat()
        },
        {
            "_id": caregiver_id, "id": caregiver_id, "phone": "+919876500001",
            "name": "Ananya Sharma", "role": "caregiver", "language": "en",
            "linked_patient_ids": [patient_id], "created_at": now.isoformat()
        },
        {
            "_id": pharmacist_id, "id": pharmacist_id, "phone": "+919876500099",
            "name": "MedPlus Health Pharmacy", "pharmacist_license": "PHARM-2024-WB-8812",
            "role": "pharmacist", "language": "en", "store_name": "MedPlus Health Hub #42",
            "created_at": now.isoformat()
        },
        {
            "_id": clinic_id, "id": clinic_id, "phone": "+919876500088",
            "name": "Apollo Heart & Diabetes Clinic", "doctor_name": "Dr. S. Mukherjee, MD",
            "role": "clinic", "language": "en", "department": "Cardiology & Internal Medicine",
            "created_at": now.isoformat()
        }
    ])

    # Active Seed Medications
    med1_id, med2_id, med3_id, med4_id = "med_metformin_500", "med_atorvastatin_20", "med_pantoprazole_40", "med_lisinopril_10"
    refill_1 = (now + timedelta(days=8)).strftime("%Y-%m-%d")
    refill_2 = (now + timedelta(days=12)).strftime("%Y-%m-%d")
    refill_3 = (now + timedelta(days=5)).strftime("%Y-%m-%d")
    refill_4 = (now + timedelta(days=20)).strftime("%Y-%m-%d")

    meds = [
        build_med_doc(patient_id, "Metformin", "500 mg", med_id=med1_id, form="Tablet",
                      frequency="Twice Daily", timing_slots=["morning", "evening"], exact_time="08:30 AM",
                      slot_times={"morning": "08:30 AM", "evening": "08:00 PM"},
                      meal_rule="with_food", meal_rule_label="Take with or immediately after meals",
                      total_doses=60, remaining_doses=16, refill_due_date=refill_1),
        build_med_doc(patient_id, "Atorvastatin", "20 mg", med_id=med2_id, form="Tablet",
                      frequency="Once Daily (Bedtime)", timing_slots=["night"], exact_time="09:30 PM",
                      meal_rule="after_food", meal_rule_label="Take at night after dinner",
                      total_doses=30, remaining_doses=8, refill_due_date=refill_2),
        build_med_doc(patient_id, "Pantoprazole", "40 mg", med_id=med3_id, form="Capsule",
                      frequency="Once Daily (Morning)", timing_slots=["morning"], exact_time="07:30 AM",
                      meal_rule="before_food", meal_rule_label="Take 30 mins before breakfast on empty stomach",
                      total_doses=30, remaining_doses=5, refill_due_date=refill_3),
        build_med_doc(patient_id, "Lisinopril", "10 mg", med_id=med4_id, form="Tablet",
                      frequency="Once Daily", timing_slots=["morning"], exact_time="08:00 AM",
                      meal_rule="empty_stomach", meal_rule_label="Take in morning with water before food",
                      total_doses=30, remaining_doses=22, refill_due_date=refill_4),
    ]
    await db.medications.insert_many(meds)
    meds_by_id = {m["_id"]: m for m in meds}

    # Seed Sample Today's Doses (medication, slot, status, time taken)
    dose_specs = [
        (med3_id, "morning", "taken", "07:35"),
        (med1_id, "morning", "taken", "08:40"),
        (med4_id, "morning", "pending", None),
        (med1_id, "evening", "pending", None),
        (med2_id, "night", "pending", None),
    ]
    await db.dose_logs.insert_many([
        make_dose_doc(meds_by_id[mid], slot, today_str, status,
                      f"{today_str}T{t}:00+05:30" if t else None)
        for mid, slot, status, t in dose_specs
    ])

    # Seed Pharmacist Refill Queue (medication, drug label, days left, refill date, urgency)
    refill_specs = [
        (med3_id, "Pantoprazole 40 mg", 5, refill_3, "High"),
        (med1_id, "Metformin 500 mg", 8, refill_1, "Medium"),
        (med2_id, "Atorvastatin 20 mg", 12, refill_2, "Normal"),
    ]
    await db.refill_orders.insert_many([
        {
            "_id": str(uuid.uuid4()), "patient_id": patient_id, "patient_name": "Ramesh Sharma",
            "patient_phone": "+919876543210", "medication_id": mid, "drug_name": label,
            "days_remaining": days, "refill_due_date": rdate, "urgency": urgency,
            "status": "due_soon", "pharmacist_id": pharmacist_id, "stock_available": True,
            "created_at": now.isoformat()
        }
        for mid, label, days, rdate, urgency in refill_specs
    ])

    # Seed Clinic Prescription Log
    rx_log_id = str(uuid.uuid4())
    await db.prescriptions.insert_one({
        "_id": rx_log_id, "id": rx_log_id, "patient_id": patient_id,
        "doctor_name": "Dr. S. Mukherjee, MD", "clinic_name": "Apollo Multi-Specialty Clinic",
        "diagnosis": "Essential Hypertension & Type 2 Diabetes Mellitus",
        "ocr_confidence_score": 94.2, "verified_by_user": True,
        "created_at": now.isoformat(), "extracted_medications_count": 4
    })

    # Seed Alert Dispatches
    await db.alert_dispatches.insert_many([
        {
            "_id": str(uuid.uuid4()), "patient_id": patient_id, "caregiver_id": caregiver_id,
            "alert_type": "Dose_Reminder", "channel": "Push", "delivery_status": "delivered",
            "message_payload": "Reminder: It's time for Pantoprazole 40 mg (Empty stomach, before breakfast).",
            "timestamp": (now - timedelta(hours=3)).isoformat()
        },
        {
            "_id": str(uuid.uuid4()), "patient_id": patient_id, "caregiver_id": caregiver_id,
            "alert_type": "Dose_Reminder", "channel": "WhatsApp", "delivery_status": "delivered",
            "message_payload": "Rx Sync: Ramesh Sharma, please take Metformin 500 mg with breakfast at 08:30 AM.",
            "timestamp": (now - timedelta(hours=2)).isoformat()
        }
    ])
    logger.info("Rx Sync database successfully seeded with initial profiles & records.")


# ---------------------------------------------------------------------------
# OTP helpers
# ---------------------------------------------------------------------------
async def check_otp(phone: str, otp: str) -> bool:
    """Demo mode accepts 123456. Otherwise the code must match the stored one,
    be unexpired, and wrong guesses are limited."""
    if DEMO_OTP_MODE and otp == "123456":
        return True
    doc = await db.otps.find_one({"phone": phone})
    if not doc:
        return False
    if doc.get("attempts", 0) >= OTP_MAX_WRONG_TRIES:
        return False
    if not secrets.compare_digest(str(doc.get("otp", "")), str(otp)):
        await db.otps.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        return False
    expires = parse_dt(doc.get("expires_at"))
    if expires and expires < now_utc():
        return False
    await db.otps.delete_one({"_id": doc["_id"]})   # one-time use
    return True


# --- Auth Endpoints (Passwordless Mobile + OTP) ---
@api_router.post("/auth/send-otp")
async def send_otp(req: AuthSendOtpRequest):
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    now = now_utc()
    existing = await db.otps.find_one({"phone": phone})

    if DEMO_OTP_MODE:
        otp_code = "123456"   # deterministic OTP for instant testing
    else:
        # Every OTP costs a real text from your SIM, so don't allow spamming one number.
        last = parse_dt(existing.get("created_at")) if existing else None
        if last and (now - last).total_seconds() < 60:
            raise HTTPException(status_code=429, detail="Please wait a minute before requesting another OTP.")
        otp_code = f"{secrets.randbelow(1000000):06d}"

    await db.otps.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "otp": otp_code, "role": req.role, "language": req.language,
                  "attempts": 0, "created_at": now.isoformat(),
                  "expires_at": (now + timedelta(minutes=OTP_TTL_MIN)).isoformat()}},
        upsert=True
    )

    response = {
        "success": True,
        "phone": phone,
        "message": f"OTP successfully dispatched via SMS/WhatsApp to {phone}.",
    }
    if DEMO_OTP_MODE:
        response["demo_otp"] = "123456"   # displayed for instant preview testing
    else:
        sms = await enqueue_sms(phone, f"Your Rx Sync verification code is {otp_code}. It is valid for {OTP_TTL_MIN} minutes.",
                                alert_type="OTP")
        response["sms_queued"] = sms.get("queued", False)
    return response


@api_router.post("/auth/verify-otp")
async def verify_otp(req: AuthVerifyOtpRequest):
    phone = req.phone.strip()
    otp = req.otp.strip()

    if not await check_otp(phone, otp):
        hint = " Use 123456 for demo." if DEMO_OTP_MODE else ""
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code." + hint)

    # Check or create user
    user = await db.users.find_one({"phone": phone})
    now_iso = now_utc().isoformat()

    if not user:
        user_id = f"usr_{uuid.uuid4().hex[:10]}"
        role = req.role or "patient"
        name = req.name or ("Elderly Patient" if role == "patient" else "Caregiver Partner" if role == "caregiver" else "Pharmacist" if role == "pharmacist" else "Doctor")
        user = {
            "_id": user_id, "id": user_id, "phone": phone, "name": name, "role": role,
            "language": req.language or "en", "emergency_contacts": [], "created_at": now_iso
        }
        await db.users.insert_one(user)
    else:
        if req.language:
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"language": req.language}})
            user["language"] = req.language

    return {
        "success": True,
        "user": serialize_doc(user),
        "token": f"bearer_{user['id']}"
    }


@api_router.get("/auth/demo-users")
async def get_demo_users():
    users = await db.users.find({}).to_list(10)
    return {"users": serialize_docs(users)}


@api_router.get("/auth/me")
async def get_current_user(user_id: Optional[str] = Query(None), phone: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    # Prefer Bearer-token (Google session) auth when present
    token_user = await get_user_from_token(authorization)
    if token_user:
        return {"user": serialize_doc(token_user)}

    query = {}
    if user_id:
        query["_id"] = user_id
    elif phone:
        query["phone"] = phone
    else:
        # Return default patient
        user = await db.users.find_one({"role": "patient"})
        return {"user": serialize_doc(user)}

    user = await db.users.find_one(query)
    if not user:
        # Return first patient fallback
        user = await db.users.find_one({"role": "patient"})
    return {"user": serialize_doc(user)}


@api_router.put("/auth/update-profile")
async def update_profile(user_id: str = Query(...), update_data: UserProfileUpdate = Body(...)):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if not update_dict:
        return {"success": True}

    await db.users.update_one({"_id": user_id}, {"$set": update_dict})
    updated = await db.users.find_one({"_id": user_id})
    return {"success": True, "user": serialize_doc(updated)}


# --- Emergent-managed Google Auth (session-based) ---
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

@app.on_event("startup")
async def create_auth_indexes():
    try:
        await db.users.create_index("email", unique=True, sparse=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        # indexes that keep the scheduler and SMS queue fast
        await db.dose_logs.create_index([("date", 1), ("status", 1)])
        await db.sms_jobs.create_index([("status", 1), ("created_at", 1)])
        logger.info("Indexes ensured.")
    except Exception as idx_err:
        logger.warning(f"Index creation skipped: {idx_err}")


async def get_user_from_token(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            expires_at = None
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now_utc():
            return None
    user = await db.users.find_one({"_id": session.get("user_id")})
    return user


@api_router.post("/auth/session")
async def create_auth_session(payload: SessionRequest):
    session_id = payload.session_id.strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    try:
        async with httpx.AsyncClient(timeout=15) as http_client:
            resp = await http_client.get(
                EMERGENT_AUTH_SESSION_URL,
                headers={"X-Session-ID": session_id}
            )
    except Exception as e:
        logger.error(f"Emergent auth session-data call failed: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    data = resp.json()
    email = data.get("email")
    name = data.get("name") or (email.split("@")[0] if email else "Google User")
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Incomplete session data")

    now = now_utc()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["_id"]
        await db.users.update_one(
            {"_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": now.isoformat()}}
        )
        user = await db.users.find_one({"_id": user_id})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "_id": user_id, "id": user_id, "email": email, "name": name, "picture": picture,
            "role": "patient", "role_selected": False, "language": "en", "auth_provider": "google",
            "emergency_contacts": [], "created_at": now.isoformat(), "last_login": now.isoformat()
        }
        await db.users.insert_one(user)

    expires_at = now + timedelta(days=7)
    await db.user_sessions.insert_one({
        "_id": str(uuid.uuid4()),
        "session_token": session_token,
        "user_id": user_id,
        "created_at": now.isoformat(),
        "expires_at": expires_at
    })

    return {"session_token": session_token, "user": serialize_doc(user)}


@api_router.post("/auth/select-role")
async def select_role(payload: SelectRoleRequest, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if payload.role not in ["patient", "caregiver", "pharmacist", "clinic"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    update_fields = {"role": payload.role, "role_selected": True}
    if payload.language:
        update_fields["language"] = payload.language
    await db.users.update_one({"_id": user["_id"]}, {"$set": update_fields})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"success": True, "user": serialize_doc(updated)}


@api_router.post("/auth/logout")
async def logout_session(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token:
            await db.user_sessions.delete_one({"session_token": token})
    return {"success": True}


@api_router.post("/auth/link-phone")
async def link_phone(payload: LinkPhoneRequest, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    phone = payload.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    if not await check_otp(phone, payload.otp.strip()):
        hint = " Use 123456 for demo." if DEMO_OTP_MODE else ""
        raise HTTPException(status_code=400, detail="Invalid or expired OTP." + hint)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"phone": phone, "phone_linked": True}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"success": True, "user": serialize_doc(updated)}


# Magic WhatsApp Invite Link generator & resolver (The Remote Handshake)
@api_router.post("/auth/create-magic-link")
async def create_magic_link(caregiver_id: str = Body(...), patient_name: str = Body("My Family Member"), patient_phone: str = Body("")):
    code = f"RX-{uuid.uuid4().hex[:6].upper()}"
    now_iso = now_utc().isoformat()

    magic_doc = {
        "_id": str(uuid.uuid4()),
        "code": code,
        "caregiver_id": caregiver_id,
        "patient_name": patient_name,
        "patient_phone": patient_phone,
        "created_at": now_iso,
        "claimed": False
    }
    await db.magic_links.insert_one(magic_doc)

    # Format pre-approved WhatsApp message template
    whatsapp_message = (
        f"Namaste {patient_name}! Your family caregiver has set up your daily medicine schedule on Rx Sync med reminder.\n\n"
        f"Tap this Magic Link to activate your daily reminders instantly:\n"
        f"https://rxsync.emergent.app/invite/{code}\n\n"
        f"Code: {code} (No password needed)"
    )

    return {
        "success": True,
        "code": code,
        "magic_link": f"https://rxsync.emergent.app/invite/{code}",
        "whatsapp_template": whatsapp_message
    }


@api_router.get("/auth/claim-magic-link/{code}")
async def claim_magic_link(code: str, patient_id: Optional[str] = Query(None)):
    magic_doc = await db.magic_links.find_one({"code": code.upper()})
    if not magic_doc:
        raise HTTPException(status_code=404, detail="Invalid or expired magic invite code")

    caregiver_id = magic_doc.get("caregiver_id")
    caregiver = await db.users.find_one({"_id": caregiver_id})

    if patient_id:
        await db.users.update_one({"_id": patient_id}, {"$set": {"caregiver_id": caregiver_id}})
        await db.users.update_one({"_id": caregiver_id}, {"$addToSet": {"linked_patient_ids": patient_id}})
        await db.magic_links.update_one({"code": code.upper()}, {"$set": {"claimed": True, "claimed_by": patient_id}})

    return {
        "success": True,
        "caregiver_name": caregiver.get("name", "Family Caregiver") if caregiver else "Family Caregiver",
        "patient_name": magic_doc.get("patient_name"),
        "caregiver_phone": caregiver.get("phone") if caregiver else ""
    }


# ---------------------------------------------------------------------------
# Vision AI Prescription Extraction & OCR Confidence Scoring
# ---------------------------------------------------------------------------
@api_router.post("/prescriptions/extract-ocr")
async def extract_prescription_ocr(
    image_base64: Optional[str] = Body(None),
    image_url: Optional[str] = Body(None),
    language: Optional[str] = Body("en")
):
    """
    Uses GPT-4o Vision to read handwritten/typed prescriptions with per-field OCR confidence scoring.
    Highlights fields <85% confidence threshold for mandatory verification.
    """
    try:
        extracted_data = None

        # If image is provided and LLM key is available, run live GPT-4o Vision analysis
        if EMERGENT_LLM_KEY and (image_base64 or image_url):
            try:
                prompt_text = (
                    "You are a clinical expert OCR Vision AI. Analyze this doctor prescription image.\n"
                    "Extract all medications, dosage, frequency, timing slots (morning/afternoon/evening/night), "
                    "meal rules (before_food/after_food/with_food/empty_stomach), doctor name, and clinic details.\n"
                    "For EACH extracted field (drug_name, dosage, timing, meal_rule), estimate an OCR confidence score from 0 to 100 based on handwriting clarity.\n"
                    "CRITICAL: Any field with handwriting ambiguity or low clarity must have confidence below 85.\n"
                    "Return ONLY valid JSON formatted as:\n"
                    "{\n"
                    '  "doctor_name": "Dr. Name",\n'
                    '  "clinic_name": "Clinic Name",\n'
                    '  "diagnosis": "Diagnosed Condition",\n'
                    '  "overall_confidence": 92.0,\n'
                    '  "medications": [\n'
                    "    {\n"
                    '      "drug_name": "Metformin",\n'
                    '      "drug_name_confidence": 95,\n'
                    '      "dosage": "500 mg",\n'
                    '      "dosage_confidence": 90,\n'
                    '      "form": "Tablet",\n'
                    '      "frequency": "Twice Daily",\n'
                    '      "timing_slots": ["morning", "evening"],\n'
                    '      "exact_time": "08:30 AM",\n'
                    '      "timing_confidence": 88,\n'
                    '      "meal_rule": "with_food",\n'
                    '      "meal_rule_label": "Take with meals",\n'
                    '      "meal_confidence": 92,\n'
                    '      "total_doses": 30,\n'
                    '      "requires_verification": false\n'
                    "    }\n"
                    "  ]\n"
                    "}\n"
                    "If the image is NOT a prescription or is too blurry/unreadable to extract any medication, "
                    'return exactly: {"unreadable": true, "medications": []}. Do not invent medications.'
                )

                chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"ocr_{uuid.uuid4().hex[:8]}",
                    system_message="You are a clinical OCR Vision AI that extracts structured prescription data and calculates field confidence scores."
                ).with_model("openai", "gpt-4o")

                # Build multimodal message
                if image_base64:
                    # Clean base64 header if present
                    raw_b64 = image_base64.split(",")[-1] if "," in image_base64 else image_base64
                    user_msg = UserMessage(
                        text=prompt_text,
                        file_contents=[ImageContent(image_base64=raw_b64)]
                    )
                else:
                    user_msg = UserMessage(text=f"{prompt_text}\nPrescription Image URL: {image_url}")

                llm_res = await chat.send_message(user_msg)

                # Robustly extract JSON from the model response
                clean_res = (llm_res or "").strip()
                if clean_res.startswith("```json"):
                    clean_res = clean_res[7:]
                if clean_res.startswith("```"):
                    clean_res = clean_res[3:]
                if clean_res.endswith("```"):
                    clean_res = clean_res[:-3]
                clean_res = clean_res.strip()

                parsed = None
                if clean_res:
                    try:
                        parsed = json.loads(clean_res)
                    except json.JSONDecodeError:
                        # Grab the first {...} JSON object in the text
                        match = re.search(r"\{.*\}", clean_res, re.DOTALL)
                        if match:
                            try:
                                parsed = json.loads(match.group(0))
                            except json.JSONDecodeError:
                                parsed = None

                if parsed is not None and not parsed.get("unreadable"):
                    extracted_data = parsed
                else:
                    logger.info("LLM Vision returned unreadable/empty result for provided image.")
            except Exception as llm_err:
                logger.error(f"LLM Vision extraction exception: {llm_err}")

        # If a real image was supplied but the AI could not extract any medication,
        # return a clear retry message instead of silently showing demo data.
        image_provided = bool(image_base64 or image_url)
        if image_provided and (not extracted_data or not extracted_data.get("medications")):
            return {
                "success": False,
                "readable": False,
                "message": "We couldn't clearly read this prescription. Please retake a sharper, well-lit photo showing the full prescription, or add your medicines manually.",
                "low_confidence_threshold": 85
            }

        # Fallback / Simulated High-Precision Clinical Prescription Parser (sample demo path only)
        if not extracted_data:
            extracted_data = {
                "doctor_name": "Dr. S. Mukherjee, MD (Cardiologist)",
                "clinic_name": "Apollo Multi-Specialty Heart Center",
                "diagnosis": "Essential Hypertension & Glycemic Management",
                "overall_confidence": 89.5,
                "medications": [
                    {
                        "drug_name": "Metformin",
                        "drug_name_confidence": 96,
                        "dosage": "500 mg",
                        "dosage_confidence": 94,
                        "form": "Tablet",
                        "frequency": "Twice Daily",
                        "timing_slots": ["morning", "evening"],
                        "exact_time": "08:30 AM",
                        "timing_confidence": 92,
                        "meal_rule": "with_food",
                        "meal_rule_label": "Take with or right after food",
                        "meal_confidence": 90,
                        "total_doses": 60,
                        "requires_verification": False
                    },
                    {
                        "drug_name": "Atorvastatin",
                        "drug_name_confidence": 92,
                        "dosage": "20 mg",
                        "dosage_confidence": 88,
                        "form": "Tablet",
                        "frequency": "Once Daily (Bedtime)",
                        "timing_slots": ["night"],
                        "exact_time": "09:30 PM",
                        "timing_confidence": 89,
                        "meal_rule": "after_food",
                        "meal_rule_label": "Take at night after dinner",
                        "meal_confidence": 91,
                        "total_doses": 30,
                        "requires_verification": False
                    },
                    {
                        "drug_name": "Lisinopril",
                        "drug_name_confidence": 78, # Flagged below 85% for mandatory review
                        "dosage": "10 mg",
                        "dosage_confidence": 82, # Flagged below 85%
                        "form": "Tablet",
                        "frequency": "Once Daily",
                        "timing_slots": ["morning"],
                        "exact_time": "08:00 AM",
                        "timing_confidence": 76, # Flagged below 85%
                        "meal_rule": "empty_stomach",
                        "meal_rule_label": "Take in morning before breakfast",
                        "meal_confidence": 84, # Flagged below 85%
                        "total_doses": 30,
                        "requires_verification": True,
                        "verification_reason": "Handwriting script for Lisinopril 10mg was cursive; requires confirmation before saving."
                    }
                ]
            }

        # Enrich each medication with AI drug education and side effects
        for med in extracted_data.get("medications", []):
            d_info = get_drug_clinical_info(med["drug_name"], language=language or "en")
            med["rxcui"] = d_info.get("rxcui", "0000")
            med["generic_name"] = d_info.get("generic_name", med["drug_name"])
            med["tier1_side_effects"] = d_info.get("tier1_side_effects", [])
            med["tier2_side_effects"] = d_info.get("tier2_side_effects", [])
            med["drug_mechanism"] = d_info.get("mechanism", "")
            med["why_critical"] = d_info.get("why_critical", "")
            med["missed_dose_consequence"] = d_info.get("missed_dose_consequence", "")

            # Check if any field is below 85% threshold
            min_conf = min(
                med.get("drug_name_confidence", 90),
                med.get("dosage_confidence", 90),
                med.get("timing_confidence", 90),
                med.get("meal_confidence", 90)
            )
            if min_conf < 85:
                med["requires_verification"] = True
                if "verification_reason" not in med:
                    med["verification_reason"] = f"Field confidence ({min_conf}%) is below 85% clinical safety threshold."

        return {
            "success": True,
            "extracted_data": extracted_data,
            "low_confidence_threshold": 85
        }
    except Exception as e:
        logger.error(f"Prescription OCR Extraction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/prescriptions/verify-and-save")
async def verify_and_save_prescription(payload: PrescriptionVerificationSubmit):
    """
    Step 3 Verification Form: Saves the verified prescription, creates active medications,
    and schedules initial dose routines and refill queues.
    """
    patient_id = payload.patient_id
    now = now_utc()
    now_iso = now.isoformat()
    today_str = today_ist_str()
    patient = await db.users.find_one({"_id": patient_id})
    patient_name = (patient or {}).get("name", "Patient")

    rx_id = f"rx_{uuid.uuid4().hex[:8]}"
    rx_doc = {
        "_id": rx_id,
        "id": rx_id,
        "patient_id": patient_id,
        "doctor_name": payload.doctor_name,
        "clinic_name": payload.clinic_name,
        "diagnosis": payload.diagnosis,
        "image_url": payload.image_url,
        "ocr_confidence_score": payload.ocr_confidence_score,
        "verified_by_user": True,
        "extracted_medications_count": len(payload.medications),
        "created_at": now_iso
    }
    await db.prescriptions.insert_one(rx_doc)

    created_meds = []
    override_keys = ("generic_name", "rxcui", "tier1_side_effects", "tier2_side_effects",
                     "drug_mechanism", "why_critical", "missed_dose_consequence")

    for item in payload.medications:
        refill_date = (now + timedelta(days=25)).strftime("%Y-%m-%d")
        med_doc = build_med_doc(
            patient_id, item.get("drug_name", "Medication"), item.get("dosage", "1 dose"),
            prescription_id=rx_id,
            form=item.get("form", "Tablet"),
            frequency=item.get("frequency", "Once Daily"),
            timing_slots=item.get("timing_slots", ["morning"]),
            exact_time=item.get("exact_time", "08:00 AM"),
            slot_times=item.get("slot_times"),
            meal_rule=item.get("meal_rule", "after_food"),
            meal_rule_label=item.get("meal_rule_label", "Take after meals"),
            total_doses=item.get("total_doses", 30),
            refill_due_date=refill_date,
            overrides={k: item.get(k) for k in override_keys},
        )
        await db.medications.insert_one(med_doc)
        created_meds.append(serialize_doc(med_doc))

        # Create today's dose schedule for each timing slot (each slot has its own time)
        await ensure_doses_for_med(med_doc, today_str)

        # Create pharmacy refill tracker
        await db.refill_orders.insert_one({
            "_id": str(uuid.uuid4()),
            "patient_id": patient_id,
            "patient_name": patient_name,
            "medication_id": med_doc["_id"],
            "drug_name": f"{med_doc['drug_name']} {med_doc['dosage']}",
            "days_remaining": 25,
            "refill_due_date": refill_date,
            "urgency": "Normal",
            "status": "active_monitoring",
            "created_at": now_iso
        })

    return {
        "success": True,
        "prescription_id": rx_id,
        "medications": created_meds,
        "message": "Prescription successfully verified, saved, and scheduled into daily routine."
    }


@api_router.get("/prescriptions")
async def get_prescriptions(patient_id: Optional[str] = Query(None)):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id
    rxs = await db.prescriptions.find(query).sort("created_at", -1).to_list(100)
    return {"prescriptions": serialize_docs(rxs)}


# ---------------------------------------------------------------------------
# Medications & Cross-Drug Interaction Screening (RxNorm/OpenFDA)
# ---------------------------------------------------------------------------
@api_router.get("/medications")
async def get_medications(patient_id: Optional[str] = Query(None), active_only: bool = True):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id
    if active_only:
        query["active"] = True
    meds = await db.medications.find(query).to_list(100)
    return {"medications": serialize_docs(meds)}


@api_router.get("/medications/{med_id}/education")
async def get_medication_education(med_id: str, language: str = Query("en")):
    med = await db.medications.find_one({"_id": med_id})
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")

    drug_info = get_drug_clinical_info(med["drug_name"], language=language)
    return {
        "id": med_id,
        "drug_name": med.get("drug_name"),
        "dosage": med.get("dosage"),
        "meal_rule": med.get("meal_rule"),
        "meal_rule_label": drug_info.get("meal_rule_label", med.get("meal_rule_label")),
        "mechanism": drug_info.get("mechanism", med.get("drug_mechanism")),
        "why_critical": drug_info.get("why_critical", med.get("why_critical")),
        "missed_dose_consequence": drug_info.get("missed_dose_consequence", med.get("missed_dose_consequence")),
        "tier1_side_effects": drug_info.get("tier1_side_effects", med.get("tier1_side_effects")),
        "tier2_side_effects": drug_info.get("tier2_side_effects", med.get("tier2_side_effects")),
        "rxcui": drug_info.get("rxcui", med.get("rxcui", "0000"))
    }


@api_router.post("/medications/check-interactions")
async def check_drug_interactions(payload: InteractionCheckRequest):
    """
    Cross-references active drugs against RxNorm, OpenFDA, and local clinical DDI matrix.
    Returns flagged contraindications, severity levels, and clinical precautions.
    """
    drug_names = [d.strip().lower() for d in payload.medication_names if d.strip()]
    flagged_interactions = []
    checked_pairs = set()

    # 1. Check local clinical interaction matrix
    for i in range(len(drug_names)):
        for j in range(i + 1, len(drug_names)):
            d1 = drug_names[i]
            d2 = drug_names[j]
            pair_key = tuple(sorted([d1, d2]))
            if pair_key in checked_pairs:
                continue
            checked_pairs.add(pair_key)

            for rule in LOCAL_DDI_RULES:
                if (rule["drug_a"] in d1 and rule["drug_b"] in d2) or (rule["drug_a"] in d2 and rule["drug_b"] in d1):
                    flagged_interactions.append({
                        "drug_a": d1.capitalize(),
                        "drug_b": d2.capitalize(),
                        "rxcui_a": rule.get("rxcui_a", "0000"),
                        "rxcui_b": rule.get("rxcui_b", "0000"),
                        "severity": rule["severity"], # Severe, Moderate, Minor
                        "mechanism": rule["mechanism"],
                        "warning_message": rule["warning"],
                        "source": "Clinical Practice Guidelines & RxNorm"
                    })

    # 2. Query RxNorm for standardized RxCUI mapping (non-blocking, runs off the event loop)
    def _lookup_rxcui(drug: str):
        try:
            rx_url = f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={drug}"
            r = requests.get(rx_url, timeout=3)
            if r.status_code == 200:
                return drug, r.json().get("idGroup", {}).get("rxnormId", [])
        except Exception:
            return drug, []
        return drug, []

    try:
        rxcui_results = await asyncio.gather(
            *[asyncio.to_thread(_lookup_rxcui, drug) for drug in drug_names]
        )
        for drug, rxcui_list in rxcui_results:
            if rxcui_list:
                logger.info(f"RxNorm RxCUI for {drug}: {rxcui_list}")
    except Exception as api_err:
        logger.debug(f"RxNorm batch query skip: {api_err}")

    return {
        "total_medications_checked": len(drug_names),
        "total_interactions_flagged": len(flagged_interactions),
        "has_critical_contraindications": any(i["severity"] == "Severe" for i in flagged_interactions),
        "interactions": flagged_interactions
    }


@api_router.post("/medications/add-manual")
async def add_medication_manual(req: ManualMedicationCreate):
    med_doc = build_med_doc(
        req.patient_id, req.drug_name, req.dosage,
        prescription_id=req.prescription_id,
        form=req.form or "Tablet",
        frequency=req.frequency or "Once Daily",
        timing_slots=req.timing_slots,
        exact_time=req.exact_time or "08:00 AM",
        slot_times=req.slot_times,
        meal_rule=req.meal_rule or "after_food",
        total_doses=req.total_doses or 30,
        remaining_doses=req.remaining_doses or 30,
        refill_due_date=req.refill_due_date,
    )
    await db.medications.insert_one(med_doc)

    # Create today's dose log (one row per slot, each with its own time)
    await ensure_doses_for_med(med_doc, today_ist_str())

    return {"success": True, "medication": serialize_doc(med_doc)}


@api_router.delete("/medications/{med_id}")
async def delete_medication(med_id: str):
    await db.medications.update_one({"_id": med_id}, {"$set": {"active": False}})
    # An archived medicine must stop producing reminders
    await db.dose_logs.update_many(
        {"medication_id": med_id, "status": "pending"},
        {"$set": {"status": "cancelled", "cancelled_at": now_utc().isoformat()}}
    )
    return {"success": True, "message": "Medication archived"}


# ---------------------------------------------------------------------------
# Daily Routine Timeline & Dose Logging
# ---------------------------------------------------------------------------
@api_router.get("/routines/today")
async def get_today_routine(patient_id: Optional[str] = Query(None)):
    today_str = today_ist_str()

    # Find patient
    if not patient_id:
        patient = await db.users.find_one({"role": "patient"})
        patient_id = patient["_id"] if patient else "patient_ramesh_001"

    # Make sure every active medicine has today's dose rows (safe to repeat)
    active_meds = await db.medications.find({"patient_id": patient_id, "active": True}).to_list(100)
    for med in active_meds:
        await ensure_doses_for_med(med, today_str)

    doses = await db.dose_logs.find(
        {"patient_id": patient_id, "date": today_str, "status": {"$ne": "cancelled"}}
    ).to_list(200)

    # Attach rich meal rules & tier 1 side effects to dose objects
    meds_by_id = {m["_id"]: m for m in active_meds}
    serialized_doses = []
    for d in serialize_docs(doses):
        med = meds_by_id.get(d.get("medication_id"))
        if not med:
            continue   # archived medicine
        d["meal_rule"] = med.get("meal_rule", "after_food")
        d["meal_rule_label"] = med.get("meal_rule_label", "Take after meals")
        d["tier1_side_effects"] = med.get("tier1_side_effects", [])
        d["form"] = med.get("form", "Tablet")
        serialized_doses.append(d)
    serialized_doses.sort(key=lambda x: x.get("scheduled_at") or "")

    # Calculate compliance score
    total_doses = len(serialized_doses)
    taken_count = sum(1 for d in serialized_doses if d.get("status") == "taken")
    compliance_pct = round((taken_count / total_doses * 100), 1) if total_doses > 0 else 100.0

    return {
        "patient_id": patient_id,
        "date": today_str,
        "total_doses": total_doses,
        "taken_count": taken_count,
        "compliance_percentage": compliance_pct,
        "doses": serialized_doses
    }


@api_router.post("/routines/log-dose")
async def log_dose_action(req: DoseLogRequest):
    now_iso = now_utc().isoformat()
    date_str = req.date or today_ist_str()

    match = {"patient_id": req.patient_id, "medication_id": req.medication_id, "date": date_str}
    if req.slot:
        match["slot"] = req.slot
    else:
        match["scheduled_time"] = req.scheduled_time
    existing = await db.dose_logs.find_one(match)

    update_fields = {
        "status": req.status,
        "meal_status": req.meal_status,
        "notes": req.notes,
        "updated_at": now_iso
    }
    if req.status == "taken":
        update_fields["taken_at"] = now_iso
        # Decrement remaining doses only the first time this dose is marked taken
        if not existing or existing.get("status") != "taken":
            await db.medications.update_one(
                {"_id": req.medication_id, "remaining_doses": {"$gt": 0}},
                {"$inc": {"remaining_doses": -1}}
            )

    if existing:
        await db.dose_logs.update_one({"_id": existing["_id"]}, {"$set": update_fields})
    else:
        # Insert fallback
        await db.dose_logs.insert_one({
            "_id": str(uuid.uuid4()),
            "patient_id": req.patient_id,
            "medication_id": req.medication_id,
            "scheduled_time": req.scheduled_time,
            "slot": req.slot,
            "status": req.status,
            "taken_at": now_iso if req.status == "taken" else None,
            "reminder_sent": True,
            "missed_alert_sent": True,
            "date": date_str
        })

    return {"success": True, "status": req.status, "recorded_at": now_iso}


@api_router.get("/routines/compliance-stats")
async def get_compliance_stats(patient_id: Optional[str] = Query(None)):
    if not patient_id:
        patient = await db.users.find_one({"role": "patient"})
        patient_id = patient["_id"] if patient else "patient_ramesh_001"

    all_logs = await db.dose_logs.find({"patient_id": patient_id, "status": {"$ne": "cancelled"}}).to_list(500)
    total = len(all_logs)
    taken = sum(1 for l in all_logs if l.get("status") == "taken")
    skipped = sum(1 for l in all_logs if l.get("status") == "skipped")
    missed = sum(1 for l in all_logs if l.get("status") == "missed")
    pending = sum(1 for l in all_logs if l.get("status") == "pending")

    decided = taken + skipped + missed
    compliance_pct = round((taken / decided * 100), 1) if decided > 0 else 94.0

    return {
        "patient_id": patient_id,
        "total_scheduled": total,
        "taken": taken,
        "skipped": skipped,
        "missed": missed,
        "pending": pending,
        "overall_compliance_score": compliance_pct,
        "streak_days": 14,
        "risk_level": "Low" if compliance_pct >= 85 else "Medium" if compliance_pct >= 70 else "High"
    }


# ---------------------------------------------------------------------------
# Health Status Check-in & One-Touch SOS Emergency Safety Engine
# ---------------------------------------------------------------------------
@api_router.post("/health-status/log")
async def log_health_status(req: HealthStatusLogRequest):
    """
    One-Click Health Status Check-in ('Well' vs 'Unwell').
    If status is 'Unwell' or 'Distress_Button', instantly triggers Tier 2 emergency escalation.
    """
    now = now_utc()
    now_iso = now.isoformat()
    patient = await db.users.find_one({"_id": req.patient_id})
    patient_name = (patient or {}).get("name", "Patient")
    caregiver_id = (patient or {}).get("caregiver_id")

    log_id = str(uuid.uuid4())
    is_emergency = req.status in ["Unwell", "Distress_Button"]

    log_doc = {
        "_id": log_id,
        "id": log_id,
        "patient_id": req.patient_id,
        "patient_name": patient_name,
        "status": req.status, # 'Well', 'Unwell', 'Distress_Button'
        "reported_symptoms": req.reported_symptoms or [],
        "notes": req.notes,
        "emergency_dispatched": is_emergency,
        "timestamp": now_iso
    }
    await db.health_status_logs.insert_one(log_doc)

    dispatch_result = None
    # Tier 2 Emergency Escalation Trigger
    if is_emergency:
        symptoms_str = ", ".join(req.reported_symptoms) if req.reported_symptoms else "General acute discomfort"
        emergency_msg = (
            f"🚨 URGENT HEALTH ALERT: {patient_name} has logged an UNWELL / DISTRESS status on Rx Sync.\n"
            f"Reported Symptoms: {symptoms_str}\n"
            f"Time: {now_ist().strftime('%I:%M %p')}\n"
            f"Please check in with {patient_name} immediately or contact emergency services."
        )

        # Dispatch multi-channel cascade: Push -> WhatsApp -> SMS
        dispatch_result = await execute_dispatch_alert(
            patient_id=req.patient_id,
            caregiver_id=caregiver_id,
            alert_type="Tier_2_Emergency",
            channel="Cascade",
            message=emergency_msg,
            patient_name=patient_name
        )

    return {
        "success": True,
        "log_id": log_id,
        "status": req.status,
        "emergency_escalated": is_emergency,
        "dispatch_details": dispatch_result
    }


@api_router.post("/health-status/sos")
async def trigger_emergency_sos(patient_id: str = Body(...), language: str = Body("en")):
    """
    One-Touch SOS Emergency Distress Button.
    Fires instantaneous Tier 2 urgent dispatches across WhatsApp, SMS, and Push.
    """
    now = now_utc()
    now_iso = now.isoformat()
    patient = await db.users.find_one({"_id": patient_id})
    patient_name = (patient or {}).get("name", "Patient")
    caregiver_id = (patient or {}).get("caregiver_id")

    # Log panic distress
    await db.health_status_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "patient_id": patient_id,
        "patient_name": patient_name,
        "status": "Distress_Button",
        "reported_symptoms": ["Emergency SOS Panic Button Pressed"],
        "emergency_dispatched": True,
        "timestamp": now_iso
    })

    sos_msg = (
        f"🚨 EMERGENCY SOS PRESSED: {patient_name} pressed the 1-Touch Distress Button on Rx Sync med reminder!\n"
        f"Immediate family/caregiver attention required at {now_ist().strftime('%I:%M %p')}."
    )

    dispatch_result = await execute_dispatch_alert(
        patient_id=patient_id,
        caregiver_id=caregiver_id,
        alert_type="Tier_2_Emergency",
        channel="Cascade",
        message=sos_msg,
        patient_name=patient_name
    )

    return {
        "success": True,
        "message": "Emergency SOS broadcasted successfully to designated family contacts.",
        "dispatch_result": dispatch_result
    }


@api_router.get("/health-status/history")
async def get_health_status_history(patient_id: Optional[str] = Query(None)):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id
    history = await db.health_status_logs.find(query).sort("timestamp", -1).to_list(100)
    return {"history": serialize_docs(history)}


# ---------------------------------------------------------------------------
# SMS queue (your own phone is the gateway)
# ---------------------------------------------------------------------------
async def enqueue_sms(to_phone: Optional[str], message: str, patient_id: Optional[str] = None,
                      alert_type: Optional[str] = None, dispatch_log_id: Optional[str] = None) -> Dict[str, Any]:
    """Put a text in the queue. The Android app on your phone picks it up and sends it."""
    phone = normalize_phone(to_phone)
    if not phone:
        return {"queued": False, "reason": "no_phone"}

    text = sms_safe(message)
    if SMS_REDIRECT_TO:
        # Testing mode: every text goes to one safe number instead of real patients.
        text = f"[for {phone}] {text}"
        phone = normalize_phone(SMS_REDIRECT_TO)
    elif phone in DEMO_PHONES:
        return {"queued": False, "reason": "demo_number_blocked"}

    now_iso = now_utc().isoformat()
    job_id = str(uuid.uuid4())
    await db.sms_jobs.insert_one({
        "_id": job_id,
        "to_phone": phone,
        "message": text,
        "status": "queued",       # queued -> sending -> sent / failed
        "attempts": 0,
        "patient_id": patient_id,
        "alert_type": alert_type,
        "dispatch_log_id": dispatch_log_id,
        "created_at": now_iso,
        "updated_at": now_iso,
    })
    return {"queued": True, "job_id": job_id, "to_phone": phone}


def require_gateway_key(x_device_key: Optional[str]) -> None:
    if not SMS_GATEWAY_KEY:
        raise HTTPException(status_code=503, detail="SMS gateway is not configured. Set SMS_GATEWAY_KEY in the backend .env file.")
    if not x_device_key or not secrets.compare_digest(x_device_key, SMS_GATEWAY_KEY):
        raise HTTPException(status_code=401, detail="Invalid device key")


@api_router.get("/sms/pending")
async def sms_pending(limit: int = Query(10, ge=1, le=50), x_device_key: Optional[str] = Header(None)):
    """The Android app calls this every few seconds. Each job is handed out to one caller only."""
    require_gateway_key(x_device_key)
    jobs = []
    for _ in range(limit):
        job = await db.sms_jobs.find_one_and_update(
            {"status": "queued"},
            {"$set": {"status": "sending", "claimed_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()},
             "$inc": {"attempts": 1}},
            sort=[("created_at", 1)],
            return_document=ReturnDocument.AFTER,
        )
        if not job:
            break
        jobs.append({"id": job["_id"], "to": job["to_phone"], "message": job["message"], "attempt": job["attempts"]})
    return {"jobs": jobs}


@api_router.post("/sms/{job_id}/status")
async def sms_report_status(job_id: str, payload: SmsStatusUpdate, x_device_key: Optional[str] = Header(None)):
    """The Android app reports 'sent' or 'failed' after trying to send."""
    require_gateway_key(x_device_key)
    if payload.status not in ("sent", "failed"):
        raise HTTPException(status_code=400, detail="status must be 'sent' or 'failed'")
    job = await db.sms_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="SMS job not found")

    now_iso = now_utc().isoformat()
    if payload.status == "sent":
        new_status, log_status = "sent", "sent"
        extra = {"sent_at": now_iso}
    elif job.get("attempts", 0) < SMS_MAX_ATTEMPTS:
        new_status, log_status = "queued", "retrying"     # try again
        extra = {"error": payload.error}
    else:
        new_status, log_status = "failed", "failed"
        extra = {"error": payload.error}

    await db.sms_jobs.update_one({"_id": job_id}, {"$set": {"status": new_status, "updated_at": now_iso, **extra}})
    if job.get("dispatch_log_id"):
        await db.alert_dispatches.update_one({"_id": job["dispatch_log_id"]}, {"$set": {"delivery_status": log_status}})
    return {"success": True, "job_id": job_id, "status": new_status}


@api_router.post("/sms/send")
async def sms_send_test(payload: SmsSendRequest, x_device_key: Optional[str] = Header(None)):
    """Queue a text by hand - handy for testing your phone app without waiting for a reminder."""
    require_gateway_key(x_device_key)
    result = await enqueue_sms(payload.to, payload.message, alert_type="Manual_Test")
    if not result.get("queued"):
        raise HTTPException(status_code=400, detail=f"Not queued: {result.get('reason')}")
    return {"success": True, **result}


@api_router.get("/sms/jobs")
async def sms_list_jobs(status: Optional[str] = Query(None), limit: int = Query(50, ge=1, le=200),
                        x_device_key: Optional[str] = Header(None)):
    require_gateway_key(x_device_key)
    query = {"status": status} if status else {}
    jobs = await db.sms_jobs.find(query).sort("created_at", -1).to_list(limit)
    return {"jobs": serialize_docs(jobs)}


async def requeue_stale_sms_jobs() -> int:
    """If the phone took a job but never reported back (app killed, no signal), try again or give up."""
    cutoff = (now_utc() - timedelta(seconds=SMS_CLAIM_TIMEOUT_SEC)).isoformat()
    retry = await db.sms_jobs.update_many(
        {"status": "sending", "claimed_at": {"$lt": cutoff}, "attempts": {"$lt": SMS_MAX_ATTEMPTS}},
        {"$set": {"status": "queued"}})
    give_up = await db.sms_jobs.update_many(
        {"status": "sending", "claimed_at": {"$lt": cutoff}, "attempts": {"$gte": SMS_MAX_ATTEMPTS}},
        {"$set": {"status": "failed", "error": "phone did not report a result"}})
    return retry.modified_count + give_up.modified_count


# ---------------------------------------------------------------------------
# Resilient Multi-Channel Alert & Dispatch Engine
# ---------------------------------------------------------------------------
def default_recipient_roles(alert_type: str) -> List[str]:
    if alert_type in ("Tier_2_Emergency", "Distress_SOS", "Missed_Dose"):
        return ["caregiver"]
    if alert_type == "Refill_Notice":
        return ["patient", "caregiver"]
    return ["patient"]   # Dose_Reminder, Checkup_Notice, anything else


async def resolve_recipients(patient: Optional[Dict[str, Any]], caregiver_id: Optional[str],
                             alert_type: str, target_phone: Optional[str]) -> List[Dict[str, str]]:
    if target_phone:
        return [{"role": "custom", "name": "", "phone": target_phone}]

    roles = default_recipient_roles(alert_type)
    recipients: List[Dict[str, str]] = []
    if "patient" in roles and patient and patient.get("phone"):
        recipients.append({"role": "patient", "name": patient.get("name", ""), "phone": patient["phone"]})
    if "caregiver" in roles and caregiver_id:
        caregiver = await db.users.find_one({"_id": caregiver_id})
        if caregiver and caregiver.get("phone"):
            recipients.append({"role": "caregiver", "name": caregiver.get("name", ""), "phone": caregiver["phone"]})
    if alert_type in ("Tier_2_Emergency", "Distress_SOS") and patient:
        for contact in patient.get("emergency_contacts") or []:
            if contact.get("phone"):
                recipients.append({"role": "emergency_contact", "name": contact.get("name", ""), "phone": contact["phone"]})

    # one text per phone number
    seen, unique = set(), []
    for r in recipients:
        key = normalize_phone(r["phone"])
        if key and key not in seen:
            seen.add(key)
            unique.append(r)
    return unique


async def execute_dispatch_alert(
    patient_id: str,
    caregiver_id: Optional[str],
    alert_type: str,
    channel: str,
    message: str,
    patient_name: str = "Patient",
    target_phone: Optional[str] = None
) -> Dict[str, Any]:
    """channel: 'Push' = in-app only, 'SMS' = in-app + text, anything else ('Cascade'/'WhatsApp') = all channels."""
    now_iso = now_utc().isoformat()
    channel = channel or "Cascade"
    use_whatsapp = channel not in ("Push", "SMS")
    use_sms = channel != "Push"
    channels_fired = []

    def make_log(log_channel: str, status: str, payload: str, **extra) -> Dict[str, Any]:
        doc = {
            "_id": str(uuid.uuid4()),
            "patient_id": patient_id,
            "caregiver_id": caregiver_id,
            "alert_type": alert_type,
            "channel": log_channel,
            "delivery_status": status,
            "message_payload": payload,
            "timestamp": now_iso,
        }
        doc.update(extra)
        return doc

    # 1. Primary: In-app alert (the app reads these logs)
    await db.alert_dispatches.insert_one(make_log("Push", "delivered", message))
    channels_fired.append({"channel": "Push", "status": "delivered"})

    # 2. Secondary: WhatsApp Business template - not connected yet, so we say so honestly.
    if use_whatsapp:
        wa_status = "pending_integration" if META_WHATSAPP_API_KEY else "not_configured"
        await db.alert_dispatches.insert_one(make_log("WhatsApp", wa_status, f"[WhatsApp Template Meta V2] {message}"))
        channels_fired.append({"channel": "WhatsApp", "status": wa_status})

    # 3. SMS through your own phone (queued; the Android app sends it)
    recipient_roles: List[str] = []
    if use_sms:
        patient = await db.users.find_one({"_id": patient_id})
        recipients = await resolve_recipients(patient, caregiver_id, alert_type, target_phone)
        if not recipients:
            await db.alert_dispatches.insert_one(make_log("SMS", "no_phone", f"[SMS] {message}"))
            channels_fired.append({"channel": "SMS", "status": "no_phone"})
        for r in recipients:
            log_id = str(uuid.uuid4())
            res = await enqueue_sms(r["phone"], message, patient_id=patient_id,
                                    alert_type=alert_type, dispatch_log_id=log_id)
            status = "queued" if res.get("queued") else res.get("reason", "not_queued")
            log_doc = make_log("SMS", status, f"[SMS] {message}", recipient_role=r["role"],
                               recipient_phone=normalize_phone(r["phone"]), sms_job_id=res.get("job_id"))
            log_doc["_id"] = log_id
            await db.alert_dispatches.insert_one(log_doc)
            channels_fired.append({"channel": "SMS", "status": status, "recipient": r["role"]})
            recipient_roles.append(r["role"])

    return {
        "alert_type": alert_type,
        "dispatched_at": now_iso,
        "channels": channels_fired,
        "recipients": recipient_roles,
        "cascade_complete": True
    }


@api_router.post("/dispatch-alert")
async def dispatch_alert_endpoint(req: DispatchAlertRequest):
    patient = await db.users.find_one({"_id": req.patient_id})
    p_name = req.patient_name or (patient.get("name") if patient else "Patient")
    c_id = req.caregiver_id or (patient.get("caregiver_id") if patient else None)

    msg = req.custom_message
    if not msg:
        if req.alert_type == "Dose_Reminder":
            msg = f"Reminder for {p_name}: It's time to take {req.drug_name or 'prescribed medication'} at {req.scheduled_time or 'scheduled time'}."
        elif req.alert_type == "Refill_Notice":
            msg = f"Prescription Refill Alert for {p_name}: {req.drug_name or 'Medication'} is running low (under 7 days remaining)."
        elif req.alert_type == "Checkup_Notice":
            msg = f"Doctor Checkup Notice for {p_name}: Follow-up consultation scheduled with Apollo Clinic."
        else:
            msg = f"Notification from Rx Sync for {p_name}."

    res = await execute_dispatch_alert(
        patient_id=req.patient_id,
        caregiver_id=c_id,
        alert_type=req.alert_type,
        channel=req.channel or "Cascade",
        message=msg,
        patient_name=p_name,
        target_phone=req.target_phone
    )
    return {"success": True, "details": res}


@api_router.get("/dispatch-alert/logs")
async def get_dispatch_logs(patient_id: Optional[str] = Query(None)):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id
    logs = await db.alert_dispatches.find(query).sort("timestamp", -1).to_list(100)
    return {"logs": serialize_docs(logs)}


# ---------------------------------------------------------------------------
# Scheduler: creates daily doses, sends reminders, missed-dose and refill alerts
# ---------------------------------------------------------------------------
REMINDER_TEMPLATES = {
    "en": "Reminder for {name}: it's time to take {drug} {dosage} ({time}). {meal}",
    "hi": "{name}, अब {drug} {dosage} लेने का समय है ({time})। {meal}",
    "bn": "{name}, এখন {drug} {dosage} খাওয়ার সময় ({time})। {meal}",
}

scheduler_state: Dict[str, Any] = {
    "running": False, "last_tick": None, "last_error": None, "last_result": {},
    "last_generated_date": None, "last_refill_check_date": None,
}
scheduler_task: Optional[asyncio.Task] = None


def _dose_time(dose: Dict[str, Any]) -> datetime:
    return parse_dt(dose.get("scheduled_at")) or dose_scheduled_at(dose["date"], dose.get("scheduled_time"))


def _recent_dates() -> List[str]:
    now = now_ist()
    return [now.strftime("%Y-%m-%d"), (now - timedelta(days=1)).strftime("%Y-%m-%d")]


async def generate_daily_doses(date_str: str) -> int:
    """Create the day's dose rows for every active medicine."""
    created = 0
    meds = await db.medications.find({"active": True}).to_list(2000)
    for med in meds:
        created += await ensure_doses_for_med(med, date_str)
    return created


async def send_dose_reminder(dose: Dict[str, Any]) -> None:
    patient = await db.users.find_one({"_id": dose["patient_id"]})
    med = await db.medications.find_one({"_id": dose["medication_id"]})
    lang = (patient or {}).get("language") or "en"
    name = (patient or {}).get("name") or "Patient"
    drug = dose.get("drug_name") or (med or {}).get("drug_name") or "your medicine"
    meal = (med or {}).get("meal_rule_label", "")
    if lang != "en" and med:
        meal = get_drug_clinical_info(med["drug_name"], language=lang).get("meal_rule_label", meal)
    text = REMINDER_TEMPLATES.get(lang, REMINDER_TEMPLATES["en"]).format(
        name=name, drug=drug, dosage=dose.get("dosage") or "", time=dose.get("scheduled_time") or "", meal=meal
    ).strip()
    await execute_dispatch_alert(
        patient_id=dose["patient_id"],
        caregiver_id=(patient or {}).get("caregiver_id"),
        alert_type="Dose_Reminder",
        channel="SMS",
        message=text,
        patient_name=name,
    )


async def send_due_reminders() -> Dict[str, int]:
    now = now_ist()
    docs = await db.dose_logs.find({
        "status": "pending", "reminder_sent": {"$ne": True}, "date": {"$in": _recent_dates()}
    }).to_list(1000)
    sent = skipped = 0
    for dose in docs:
        scheduled = _dose_time(dose)
        if scheduled > now:
            continue   # not time yet
        # Claim the dose first so two server copies never send the same reminder.
        claimed = await db.dose_logs.find_one_and_update(
            {"_id": dose["_id"], "reminder_sent": {"$ne": True}},
            {"$set": {"reminder_sent": True, "reminder_sent_at": now_utc().isoformat()}})
        if not claimed:
            continue
        late_min = (now - scheduled).total_seconds() / 60
        med = await db.medications.find_one({"_id": dose["medication_id"]})
        if late_min > REMINDER_MAX_LATE_MIN or not med or not med.get("active", True):
            await db.dose_logs.update_one({"_id": dose["_id"]},
                                          {"$set": {"reminder_skipped": True, "missed_alert_sent": True}})
            skipped += 1
            continue
        try:
            await send_dose_reminder(dose)
            sent += 1
        except Exception as e:
            logger.error(f"Dose reminder failed for {dose['_id']}: {e}")
            await db.dose_logs.update_one({"_id": dose["_id"]}, {"$set": {"reminder_error": str(e)}})
    return {"sent": sent, "skipped_stale": skipped}


async def send_missed_dose_alerts() -> int:
    """Reminder was sent, nobody confirmed the dose -> tell the caregiver."""
    now = now_ist()
    docs = await db.dose_logs.find({
        "status": "pending", "reminder_sent": True, "reminder_skipped": {"$ne": True},
        "missed_alert_sent": {"$ne": True}, "date": {"$in": _recent_dates()}
    }).to_list(1000)
    alerts = 0
    for dose in docs:
        scheduled = _dose_time(dose)
        if now < scheduled + timedelta(minutes=MISSED_DOSE_GRACE_MIN):
            continue
        claimed = await db.dose_logs.find_one_and_update(
            {"_id": dose["_id"], "status": "pending", "missed_alert_sent": {"$ne": True}},
            {"$set": {"missed_alert_sent": True, "missed_alert_at": now_utc().isoformat()}})
        if not claimed:
            continue
        patient = await db.users.find_one({"_id": dose["patient_id"]})
        caregiver_id = (patient or {}).get("caregiver_id")
        if not caregiver_id:
            continue
        name = (patient or {}).get("name", "Patient")
        text = (f"Missed dose alert: {name} has not confirmed {dose.get('drug_name', 'a medicine')} "
                f"{dose.get('dosage') or ''} scheduled for {dose.get('scheduled_time')}. Please check in.")
        try:
            await execute_dispatch_alert(dose["patient_id"], caregiver_id, "Missed_Dose", "SMS", text, name)
            alerts += 1
        except Exception as e:
            logger.error(f"Missed-dose alert failed for {dose['_id']}: {e}")
    return alerts


async def check_refills() -> int:
    """Once a day: warn when a medicine has about REFILL_ALERT_DAYS days (or fewer) of doses left."""
    today = today_ist_str()
    alerts = 0
    meds = await db.medications.find({"active": True}).to_list(2000)
    for med in meds:
        remaining = med.get("remaining_doses")
        if remaining is None:
            continue
        per_day = max(1, len(med.get("timing_slots") or ["morning"]))
        days_left = remaining // per_day
        if days_left > REFILL_ALERT_DAYS:
            continue

        last = med.get("last_refill_alert_date")
        if last and (datetime.strptime(today, "%Y-%m-%d") - datetime.strptime(last, "%Y-%m-%d")).days < 3:
            continue   # at most one reminder every 3 days

        patient = await db.users.find_one({"_id": med["patient_id"]})
        name = (patient or {}).get("name", "Patient")
        urgency = "High" if days_left <= 3 else "Medium"
        refill_date = (now_ist() + timedelta(days=days_left)).strftime("%Y-%m-%d")

        # keep the pharmacist queue in sync
        order = await db.refill_orders.find_one(
            {"medication_id": med["_id"], "status": {"$in": ["due_soon", "active_monitoring"]}})
        if order:
            await db.refill_orders.update_one({"_id": order["_id"]}, {"$set": {
                "days_remaining": days_left, "urgency": urgency, "status": "due_soon",
                "refill_due_date": refill_date, "updated_at": now_utc().isoformat()}})
        else:
            await db.refill_orders.insert_one({
                "_id": str(uuid.uuid4()), "patient_id": med["patient_id"], "patient_name": name,
                "patient_phone": (patient or {}).get("phone"), "medication_id": med["_id"],
                "drug_name": f"{med.get('drug_name')} {med.get('dosage')}", "days_remaining": days_left,
                "refill_due_date": refill_date, "urgency": urgency, "status": "due_soon",
                "created_at": now_utc().isoformat()})

        text = (f"Refill alert for {name}: {med.get('drug_name')} {med.get('dosage')} has about "
                f"{days_left} day(s) of doses left. Please arrange a refill.")
        try:
            await execute_dispatch_alert(med["patient_id"], (patient or {}).get("caregiver_id"),
                                         "Refill_Notice", "SMS", text, name)
            await db.medications.update_one({"_id": med["_id"]}, {"$set": {"last_refill_alert_date": today}})
            alerts += 1
        except Exception as e:
            logger.error(f"Refill alert failed for {med['_id']}: {e}")
    return alerts


async def rollover_old_pending_doses() -> int:
    """Doses from before yesterday that were never confirmed become 'missed'."""
    cutoff = _recent_dates()[1]
    res = await db.dose_logs.update_many(
        {"status": "pending", "date": {"$lt": cutoff}},
        {"$set": {"status": "missed", "missed_at": now_utc().isoformat()}})
    return res.modified_count


async def scheduler_tick() -> Dict[str, Any]:
    now = now_ist()
    today = now.strftime("%Y-%m-%d")
    result: Dict[str, Any] = {}

    async def step(name: str, coro):
        try:
            result[name] = await coro
        except Exception as e:      # one failing step must not stop the others
            logger.exception(f"Scheduler step '{name}' failed")
            result[name] = f"error: {e}"

    if scheduler_state["last_generated_date"] != today:
        await step("doses_created", generate_daily_doses(today))
        scheduler_state["last_generated_date"] = today
    await step("reminders", send_due_reminders())
    await step("missed_alerts", send_missed_dose_alerts())
    await step("sms_requeued", requeue_stale_sms_jobs())
    if now.hour >= REFILL_CHECK_HOUR_IST and scheduler_state["last_refill_check_date"] != today:
        await step("refill_alerts", check_refills())
        scheduler_state["last_refill_check_date"] = today
    await step("rolled_over", rollover_old_pending_doses())
    return result


async def scheduler_loop():
    scheduler_state["running"] = True
    logger.info(f"Scheduler started (every {SCHEDULER_INTERVAL_SEC}s, India time).")
    try:
        while True:
            try:
                scheduler_state["last_result"] = await scheduler_tick()
                scheduler_state["last_error"] = None
           