 import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
 import { Alert, Platform } from 'react-native';
 import {
   UserProfile,
   UserRole,
   SupportedLanguage,
   DoseItem,
   Medication,
   RefillOrder,
   DrugInteraction,
   AlertDispatchLog
 } from '../types';
 import { TRANSLATIONS } from '../localization/translations';
 
 const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
 
 interface AppContextType {
   user: UserProfile | null;
   role: UserRole;
   setRole: (role: UserRole) => void;
   language: SupportedLanguage;
   setLanguage: (lang: SupportedLanguage) => void;
   t: typeof TRANSLATIONS.en;
   doses: DoseItem[];
   complianceScore: number;
   medications: Medication[];
   refillQueue: RefillOrder[];
   alertLogs: AlertDispatchLog[];
   interactions: DrugInteraction[];
   isLoading: boolean;
   healthStatus: 'Well' | 'Unwell' | 'Unknown';
   fetchTodayRoutine: () => Promise<void>;
   fetchMedications: () => Promise<void>;
   fetchRefillQueue: () => Promise<void>;
   fetchAlertLogs: () => Promise<void>;
   checkInteractions: (names?: string[]) => Promise<DrugInteraction[]>;
   logDose: (medicationId: string, scheduledTime: string, status: 'taken' | 'skipped') => Promise<void>;
   logHealthStatus: (status: 'Well' | 'Unwell', symptoms?: string[]) => Promise<void>;
   triggerEmergencySOS: () => Promise<void>;
   processRefillOrder: (refillId: string) => Promise<void>;
   createMagicInviteLink: (patientName: string) => Promise<{ code: string; magic_link: string; whatsapp_template: string }>;
   switchDemoUser: (targetRole: UserRole) => Promise<void>;
   loginWithOtp: (phone: string, otp: string, role?: UserRole) => Promise<boolean>;
   logout: () => void;
 }
 
 const AppContext = createContext<AppContextType | undefined>(undefined);
 
 export const AppProvider = ({ children }: { children: ReactNode }) => {
   const [user, setUser] = useState<UserProfile | null>({
     id: 'patient_ramesh_001',
     phone: '+919876543210',
     name: 'Ramesh Sharma',
     role: 'patient',
     language: 'en',
     age: 68,
     gender: 'Male',
     caregiver_id: 'caregiver_ananya_001'
   });
   const [role, setRoleState] = useState<UserRole>('patient');
   const [language, setLanguageState] = useState<SupportedLanguage>('en');
   const [doses, setDoses] = useState<DoseItem[]>([]);
   const [complianceScore, setComplianceScore] = useState<number>(92.0);
   const [medications, setMedications] = useState<Medication[]>([]);
   const [refillQueue, setRefillQueue] = useState<RefillOrder[]>([]);
   const [alertLogs, setAlertLogs] = useState<AlertDispatchLog[]>([]);
   const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
   const [isLoading, setIsLoading] = useState<boolean>(false);
   const [healthStatus, setHealthStatus] = useState<'Well' | 'Unwell' | 'Unknown'>('Well');
 
   const t = TRANSLATIONS[language] || TRANSLATIONS.en;
 
   const setLanguage = (lang: SupportedLanguage) => {
     setLanguageState(lang);
     if (user) {
       setUser({ ...user, language: lang });
     }
   };
 
   const setRole = (newRole: UserRole) => {
     setRoleState(newRole);
     if (user) {
       setUser({ ...user, role: newRole });
     }
   };
 
   const fetchTodayRoutine = async () => {
     try {
       setIsLoading(true);
       const patientId = user?.role === 'patient' ? user.id : 'patient_ramesh_001';
       const res = await fetch(`${BACKEND_URL}/api/routines/today?patient_id=${patientId}`);
       if (res.ok) {
         const data = await res.json();
         setDoses(data.doses || []);
         setComplianceScore(data.compliance_percentage || 90.0);
       }
     } catch (err) {
       console.log('Error fetching today routine:', err);
     } finally {
       setIsLoading(false);
     }
   };
 
   const fetchMedications = async () => {
     try {
       const patientId = user?.role === 'patient' ? user.id : 'patient_ramesh_001';
       const res = await fetch(`${BACKEND_URL}/api/medications?patient_id=${patientId}`);
       if (res.ok) {
         const data = await res.json();
         setMedications(data.medications || []);
       }
     } catch (err) {
       console.log('Error fetching medications:', err);
     }
   };
 
   const fetchRefillQueue = async () => {
     try {
       const res = await fetch(`${BACKEND_URL}/api/pharmacist/refill-queue`);
       if (res.ok) {
         const data = await res.json();
         setRefillQueue(data.queue || []);
       }
     } catch (err) {
       console.log('Error fetching refill queue:', err);
     }
   };
 
   const fetchAlertLogs = async () => {
     try {
       const patientId = user?.role === 'patient' ? user.id : 'patient_ramesh_001';
       const res = await fetch(`${BACKEND_URL}/api/dispatch-alert/logs?patient_id=${patientId}`);
       if (res.ok) {
         const data = await res.json();
         setAlertLogs(data.logs || []);
       }
     } catch (err) {
       console.log('Error fetching alert logs:', err);
     }
   };
 
   const checkInteractions = async (names?: string[]): Promise<DrugInteraction[]> => {
     try {
       const listToCheck = names && names.length > 0 
         ? names 
         : (medications.length > 0 ? medications.map(m => m.drug_name) : ['Metformin', 'Atorvastatin', 'Pantoprazole', 'Lisinopril']);
       
       const res = await fetch(`${BACKEND_URL}/api/medications/check-interactions`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ medication_names: listToCheck })
       });
       if (res.ok) {
         const data = await res.json();
         const fetched = data.interactions || [];
         setInteractions(fetched);
         return fetched;
       }
     } catch (err) {
       console.log('Error checking interactions:', err);
     }
     return [];
   };
 
   const logDose = async (medicationId: string, scheduledTime: string, status: 'taken' | 'skipped') => {
     try {
       const patientId = user?.role === 'patient' ? user.id : 'patient_ramesh_001';
       // Optimistic update
       setDoses(prev =>
         prev.map(d =>
           d.medication_id === medicationId && d.scheduled_time === scheduledTime
             ? { ...d, status, taken_at: status === 'taken' ? new Date().toISOString() : undefined }
             : d
         )
       );
 
       const res = await fetch(`${BACKEND_URL}/api/routines/log-dose`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           patient_id: patientId,
           medication_id: medicationId,
           scheduled_time: scheduledTime,
           status
         })
       });
 
       if (res.ok) {
         fetchTodayRoutine();
         fetchMedications();
       }
     } catch (err) {
       console.log('Error logging dose:', err);
     }
   };
 
   const logHealthStatus = async (status: 'Well' | 'Unwell', symptoms?: string[]) => {
     try {
       setHealthStatus(status);
       const patientId = user?.role === 'patient' ? user.id : 'patient_ramesh_001';
       const res = await fetch(`${BACKEND_URL}/api/health-status/log`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           patient_id: patientId,
           status,
           reported_symptoms: symptoms || [],
           language
         })
       });
       if (res.ok) {
         fetchAlertLogs();
       }
     } catch (err) {
       console.log('Error logging health status:', err);
     }
   };
 
   const triggerEmergencySOS = async () => {
     try {
       setHealthStatus('Unwell');
       const patientId = user?.role === 'patient' ? user.id : 'patient_ramesh_001';
       const res = await fetch(`${BACKEND_URL}/api/health-status/sos`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ patient_id: patientId, language })
       });
       if (res.ok) {
         fetchAlertLogs();
       }
     } catch (err) {
       console.log('Error triggering SOS:', err);
     }
   };
 
   const processRefillOrder = async (refillId: string) => {
     try {
       const res = await fetch(`${BACKEND_URL}/api/pharmacist/process-refill`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ refill_id: refillId, new_status: 'dispatched' })
       });
       if (res.ok) {
         fetchRefillQueue();
         fetchMedications();
         fetchAlertLogs();
       }
     } catch (err) {
       console.log('Error processing refill:', err);
     }
   };
 
   const createMagicInviteLink = async (patientName: string) => {
     try {
       const caregiverId = user?.id || 'caregiver_ananya_001';
       const res = await fetch(`${BACKEND_URL}/api/auth/create-magic-link`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           caregiver_id: caregiverId,
           patient_name: patientName,
           patient_phone: '+919876543210'
         })
       });
       if (res.ok) {
         return await res.json();
       }
     } catch (err) {
       console.log('Error creating magic link:', err);
     }
     return {
       code: 'RX-DEMO99',
       magic_link: 'https://rxsync.emergent.app/invite/RX-DEMO99',
       whatsapp_template: 'Rx Sync Magic Invite link'
     };
   };
 
   const switchDemoUser = async (targetRole: UserRole) => {
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/demo-users`);
       if (res.ok) {
         const data = await res.json();
         const match = data.users.find((u: UserProfile) => u.role === targetRole);
         if (match) {
           setUser(match);
           setRoleState(targetRole);
           setLanguageState(match.language || 'en');
           return;
         }
       }
     } catch (err) {
       console.log('Error switching demo user:', err);
     }
     // Fallback
     setRoleState(targetRole);
   };
 
   const loginWithOtp = async (phone: string, otp: string, selectedRole: UserRole = 'patient'): Promise<boolean> => {
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           phone,
           otp,
           role: selectedRole,
           language
         })
       });
       if (res.ok) {
         const data = await res.json();
         if (data.user) {
           setUser(data.user);
           setRoleState(data.user.role || selectedRole);
           return true;
         }
       }
     } catch (err) {
       console.log('Login error:', err);
     }
     return false;
   };
 
   const logout = () => {
     setUser(null);
   };
 
   useEffect(() => {
     fetchTodayRoutine();
     fetchMedications();
     fetchRefillQueue();
     fetchAlertLogs();
     checkInteractions();
   }, [role]);
 
   return (
     <AppContext.Provider
       value={{
         user,
         role,
         setRole,
         language,
         setLanguage,
         t,
         doses,
         complianceScore,
         medications,
         refillQueue,
         alertLogs,
         interactions,
         isLoading,
         healthStatus,
         fetchTodayRoutine,
         fetchMedications,
         fetchRefillQueue,
         fetchAlertLogs,
         checkInteractions,
         logDose,
         logHealthStatus,
         triggerEmergencySOS,
         processRefillOrder,
         createMagicInviteLink,
         switchDemoUser,
         loginWithOtp,
         logout
       }}
     >
       {children}
     </AppContext.Provider>
   );
 };
 
 export const useApp = () => {
   const context = useContext(AppContext);
   if (!context) {
     throw new Error('useApp must be used within an AppProvider');
   }
   return context;
 };