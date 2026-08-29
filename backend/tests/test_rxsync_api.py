"""Rx Sync backend API regression tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           "https://medication-companion-3.preview.emergentagent.com"
API = f"{BASE_URL}/api"
PATIENT_ID = "patient_ramesh_001"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- AUTH ----------
class TestAuth:
    def test_send_otp_patient(self, s):
        r = s.post(f"{API}/auth/send-otp", json={"phone": "+919876543210", "role": "patient"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] and d["demo_otp"] == "123456"

    @pytest.mark.parametrize("phone,role", [
        ("+919876543210", "patient"),
        ("+919876500001", "caregiver"),
        ("+919876500099", "pharmacist"),
        ("+919876500088", "clinic"),
    ])
    def test_verify_otp_all_roles(self, s, phone, role):
        s.post(f"{API}/auth/send-otp", json={"phone": phone, "role": role})
        r = s.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456", "role": role})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] and d["user"]["role"] == role
        assert d["token"].startswith("bearer_")

    def test_verify_otp_wrong(self, s):
        r = s.post(f"{API}/auth/verify-otp", json={"phone": "+919876543210", "otp": "000000"})
        assert r.status_code == 400


# ---------- ROUTINES (regression: bounded dose count) ----------
class TestRoutines:
    def test_today_bounded_five_doses(self, s):
        r = s.get(f"{API}/routines/today", params={"patient_id": PATIENT_ID})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["patient_id"] == PATIENT_ID
        # Regression: must be small bounded number (~5), NOT hundreds
        assert d["total_doses"] <= 20, f"REGRESSION: {d['total_doses']} doses found (expected ~5)"
        assert d["total_doses"] >= 3
        assert 0 <= d["compliance_percentage"] <= 100
        assert isinstance(d["doses"], list)
        # every dose has expected keys
        for dose in d["doses"]:
            assert "drug_name" in dose
            assert "scheduled_time" in dose
            assert "status" in dose

    def test_log_dose_updates_status(self, s):
        # Get a pending dose
        today = s.get(f"{API}/routines/today", params={"patient_id": PATIENT_ID}).json()
        pending = [x for x in today["doses"] if x["status"] == "pending"]
        assert pending, "No pending dose to log"
        dose = pending[0]
        payload = {
            "patient_id": PATIENT_ID,
            "medication_id": dose["medication_id"],
            "scheduled_time": dose["scheduled_time"],
            "status": "taken",
        }
        r = s.post(f"{API}/routines/log-dose", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["success"]

        # verify persistence
        after = s.get(f"{API}/routines/today", params={"patient_id": PATIENT_ID}).json()
        # dose count must not blow up
        assert after["total_doses"] <= 20
        matched = [x for x in after["doses"]
                   if x["medication_id"] == dose["medication_id"]
                   and x["scheduled_time"] == dose["scheduled_time"]]
        assert any(x["status"] == "taken" for x in matched)

    def test_compliance_stats(self, s):
        r = s.get(f"{API}/routines/compliance-stats", params={"patient_id": PATIENT_ID})
        assert r.status_code == 200
        d = r.json()
        assert "overall_compliance_score" in d
        assert d["risk_level"] in ("Low", "Medium", "High")


# ---------- MEDICATIONS ----------
class TestMedications:
    def test_check_interactions_fast(self, s):
        payload = {"medication_names": ["Metformin", "Atorvastatin", "Lisinopril", "Aspirin", "Warfarin"]}
        t0 = time.time()
        r = s.post(f"{API}/medications/check-interactions", json=payload, timeout=15)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        # Regression: must NOT hang the event loop (was blocking with sync requests)
        assert elapsed < 12, f"Interactions endpoint too slow: {elapsed:.1f}s"
        d = r.json()
        assert d["total_medications_checked"] == 5
        # aspirin+warfarin is a Severe interaction in local rules
        sev = [i for i in d["interactions"] if i["severity"] == "Severe"]
        assert sev, "Expected Severe interaction (Aspirin + Warfarin)"
        assert d["has_critical_contraindications"] is True

    def test_check_interactions_empty(self, s):
        r = s.post(f"{API}/medications/check-interactions", json={"medication_names": ["Paracetamol"]})
        assert r.status_code == 200
        assert r.json()["total_interactions_flagged"] == 0

    def test_medication_education_multilang(self, s):
        for lang in ("en", "hi", "bn"):
            r = s.get(f"{API}/medications/med_metformin_500/education", params={"language": lang})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["drug_name"].lower().startswith("metformin")
            assert d["mechanism"]
            assert isinstance(d["tier1_side_effects"], list)


# ---------- PRESCRIPTIONS ----------
class TestPrescriptions:
    def test_extract_ocr_fallback(self, s):
        # No image -> uses deterministic parser
        r = s.post(f"{API}/prescriptions/extract-ocr", json={"language": "en"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"]
        meds = d["extracted_data"]["medications"]
        assert len(meds) >= 1
        # ensure per-field confidence and requires_verification flag exist
        for m in meds:
            assert "drug_name_confidence" in m
            assert "requires_verification" in m
        # Lisinopril in the deterministic fallback is flagged for verification
        flagged = [m for m in meds if m.get("requires_verification")]
        assert flagged, "Expected at least one <85% flagged med"

    def test_verify_and_save(self, s):
        payload = {
            "patient_id": PATIENT_ID,
            "doctor_name": "Dr. Test",
            "clinic_name": "Test Clinic",
            "diagnosis": "TEST_dx",
            "ocr_confidence_score": 91.0,
            "verified_by_user": True,
            "medications": [{
                "drug_name": "TEST_Paracetamol",
                "dosage": "500 mg",
                "form": "Tablet",
                "frequency": "Once Daily",
                "timing_slots": ["morning"],
                "exact_time": "09:00 AM",
                "meal_rule": "after_food",
                "total_doses": 10,
            }],
        }
        r = s.post(f"{API}/prescriptions/verify-and-save", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] and d["prescription_id"].startswith("rx_")
        assert len(d["medications"]) == 1
        # cleanup: archive the created med
        s.delete(f"{API}/medications/{d['medications'][0]['id']}")


# ---------- HEALTH STATUS / SOS ----------
class TestHealthStatus:
    def test_log_well(self, s):
        r = s.post(f"{API}/health-status/log", json={"patient_id": PATIENT_ID, "status": "Well"})
        assert r.status_code == 200
        assert r.json()["emergency_escalated"] is False

    def test_log_unwell_triggers_dispatch(self, s):
        r = s.post(f"{API}/health-status/log", json={
            "patient_id": PATIENT_ID, "status": "Unwell",
            "reported_symptoms": ["chest pain"]
        })
        assert r.status_code == 200
        d = r.json()
        assert d["emergency_escalated"] is True
        assert d["dispatch_details"]["cascade_complete"] is True
        assert len(d["dispatch_details"]["channels"]) == 3

    def test_sos_button(self, s):
        r = s.post(f"{API}/health-status/sos", json={"patient_id": PATIENT_ID, "language": "en"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"]
        assert d["dispatch_result"]["cascade_complete"] is True


# ---------- PHARMACIST ----------
class TestPharmacist:
    def test_refill_queue(self, s):
        r = s.get(f"{API}/pharmacist/refill-queue")
        assert r.status_code == 200
        assert isinstance(r.json()["queue"], list)

    def test_process_refill(self, s):
        queue = s.get(f"{API}/pharmacist/refill-queue").json()["queue"]
        if not queue:
            pytest.skip("Empty refill queue")
        rid = queue[0]["id"]
        r = s.post(f"{API}/pharmacist/process-refill", json={"refill_id": rid, "new_status": "dispatched"})
        assert r.status_code == 200
        assert r.json()["status"] == "dispatched"


# ---------- DISPATCH ALERT ----------
class TestDispatch:
    def test_dispatch_alert_endpoint(self, s):
        r = s.post(f"{API}/dispatch-alert", json={
            "patient_id": PATIENT_ID, "alert_type": "Dose_Reminder",
            "channel": "Cascade", "drug_name": "TEST_Metformin", "scheduled_time": "08:30 AM"
        })
        assert r.status_code == 200
        assert r.json()["details"]["cascade_complete"] is True

    def test_dispatch_logs(self, s):
        r = s.get(f"{API}/dispatch-alert/logs", params={"patient_id": PATIENT_ID})
        assert r.status_code == 200
        assert isinstance(r.json()["logs"], list)


# ---------- MAGIC LINK ----------
class TestMagicLink:
    def test_create_and_claim(self, s):
        r = s.post(f"{API}/auth/create-magic-link", json={
            "caregiver_id": "caregiver_ananya_001",
            "patient_name": "TEST_Ramesh",
            "patient_phone": "+919876543210",
        })
        assert r.status_code == 200
        code = r.json()["code"]
        assert code.startswith("rx-")

        r2 = s.get(f"{API}/auth/claim-magic-link/{code}", params={"patient_id": PATIENT_ID})
        assert r2.status_code == 200
        assert r2.json()["success"]
