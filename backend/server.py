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