 export type UserRole = 'patient' | 'caregiver' | 'pharmacist' | 'clinic';
 
 export type SupportedLanguage = 'en' | 'hi' | 'bn';
 
 export interface EmergencyContact {
   name: string;
   phone: string;
   relationship: string;
 }
 
 export interface UserProfile {
   id: string;
   phone: string;
   name: string;
   role: UserRole;
   language: SupportedLanguage;
   age?: number;
   gender?: string;
   caregiver_id?: string;
   linked_patient_ids?: string[];
   emergency_contacts?: EmergencyContact[];
   store_name?: string;
   doctor_name?: string;
   department?: string;
 }
 
 export interface SideEffect {
   symptom: string;
   note: string;
 }
 
 export interface Medication {
   id: string;
   patient_id: string;
   prescription_id?: string;
   drug_name: string;
   generic_name?: string;
   rxcui?: string;
   dosage: string;
   form: string;
   frequency: string;
   timing_slots: string[];
   exact_time: string;
   meal_rule: 'before_food' | 'after_food' | 'with_food' | 'empty_stomach';
   meal_rule_label: string;
   total_doses: number;
   remaining_doses: number;
   refill_due_date: string;
   active: boolean;
   tier1_side_effects: SideEffect[];
   tier2_side_effects: SideEffect[];
   drug_mechanism?: string;
   why_critical?: string;
   missed_dose_consequence?: string;
   created_at?: string;
 }
 
 export interface DoseItem {
   id: string;
   patient_id: string;
   medication_id: string;
   drug_name: string;
   dosage: string;
   form?: string;
   slot: 'morning' | 'afternoon' | 'evening' | 'night';
   scheduled_time: string;
   status: 'taken' | 'skipped' | 'pending';
   taken_at?: string;
   meal_rule?: string;
   meal_rule_label?: string;
   tier1_side_effects?: SideEffect[];
   date: string;
 }
 
 export interface DrugInteraction {
   drug_a: string;
   drug_b: string;
   rxcui_a?: string;
   rxcui_b?: string;
   severity: 'Severe' | 'Moderate' | 'Minor';
   mechanism: string;
   warning_message: string;
   source?: string;
 }
 
 export interface ExtractedMedication {
   drug_name: string;
   drug_name_confidence: number;
   dosage: string;
   dosage_confidence: number;
   form: string;
   frequency: string;
   timing_slots: string[];
   exact_time: string;
   timing_confidence: number;
   meal_rule: 'before_food' | 'after_food' | 'with_food' | 'empty_stomach';
   meal_rule_label: string;
   meal_confidence: number;
   total_doses: number;
   requires_verification: boolean;
   verification_reason?: string;
   tier1_side_effects?: SideEffect[];
   tier2_side_effects?: SideEffect[];
   drug_mechanism?: string;
   why_critical?: string;
 }
 
 export interface RefillOrder {
   id: string;
   patient_id: string;
   patient_name: string;
   patient_phone: string;
   medication_id: string;
   drug_name: string;
   days_remaining: number;
   refill_due_date: string;
   urgency: 'High' | 'Medium' | 'Normal';
   status: 'due_soon' | 'processing' | 'dispatched' | 'active_monitoring';
   stock_available: boolean;
   created_at: string;
 }
 
 export interface AlertDispatchLog {
   id: string;
   patient_id: string;
   caregiver_id?: string;
   alert_type: string;
   channel: string;
   delivery_status: string;
   message_payload: string;
   timestamp: string;
 }