 import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
 import { Alert, Platform } from 'react-native';
 import * as WebBrowser from 'expo-web-browser';
 import * as Linking from 'expo-linking';
 import { storage } from '@/src/utils/storage';
 import {
   UserProfile,
   UserRole,
   SupportedLanguage,
   DoseItem,
   ManualMedInput,
   Medication,
   RefillOrder,
   DrugInteraction,
   AlertDispatchLog
 } from '../types';
 import { TRANSLATIONS } from '../localization/translations';
 
 const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

 // Complete any pending auth session (mobile). No-op on web.
 WebBrowser.maybeCompleteAuthSession();
 const SESSION_TOKEN_KEY = 'rxsync_session_token';

 // Emergent returns session_id in the hash fragment or query string.
 const extractSessionId = (url: string | null): string | null => {
   if (!url) return null;
   const m = url.match(/[?#&]session_id=([^&#]+)/);
   return m ? decodeURIComponent(m[1]) : null;
 };
 
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
   signInWithGoogle: () => Promise<void>;
   selectRole: (role: UserRole) => Promise<void>;
   needRoleSelection: boolean;
   authLoading: boolean;
   autoGenerateInvite: boolean;
   clearAutoGenerateInvite: () => void;
   addManualMedication: (payload: ManualMedInput) => Promise<boolean>;
   updateProfile: (updates: { name?: string; language?: SupportedLanguage }) => Promise<boolean>;
   linkPhone: (phone: string, otp: string) => Promise<{ ok: boolean; message?: string }>;
   logout: () => void;
 }
 
 const AppContext = createContext<AppContextType | undefined>(undefined);
 
 const DEFAULT_USER: UserProfile = {
   id: 'patient_ramesh_001',
   phone: '+919876543210',
   name: 'Ramesh Sharma',
   role: 'patient',
   language: 'en',
   age: 68,
   gender: 'Male',
   caregiver_id: 'caregiver_ananya_001'
 };
 
 export const AppProvider = ({ children }: { children: ReactNode }) => {
   const [user, setUser] = useState<UserProfile | null>(DEFAULT_USER);
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
   const [authToken, setAuthToken] = useState<string | null>(null);
   const [needRoleSelection, setNeedRoleSelection] = useState<boolean>(false);
   const [authLoading, setAuthLoading] = useState<boolean>(false);
   const [autoGenerateInvite, setAutoGenerateInvite] = useState<boolean>(false);
   const processedSessionIds = useRef<Set<string>>(new Set());
 
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
 
   const exchangeSessionId = async (sessionId: string) => {
     if (!sessionId || processedSessionIds.current.has(sessionId)) return;
     processedSessionIds.current.add(sessionId);
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/session`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ session_id: sessionId })
       });
       if (res.ok) {
         const data = await res.json();
         if (data.session_token && data.user) {
           await storage.secureSet(SESSION_TOKEN_KEY, data.session_token);
           setAuthToken(data.session_token);
           setUser(data.user);
           setRoleState(data.user.role || 'patient');
           setLanguageState(data.user.language || 'en');
           setNeedRoleSelection(data.user.role_selected === false);
         }
       } else {
         console.log('Session exchange failed:', res.status);
       }
     } catch (err) {
       console.log('Session exchange error:', err);
     }
   };

   const signInWithGoogle = async () => {
     try {
       const redirectUrl = Platform.OS === 'web'
         ? (typeof window !== 'undefined' ? window.location.origin + '/' : '')
         : Linking.createURL('');
       const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
       if (Platform.OS === 'web') {
         if (typeof window !== 'undefined') window.location.href = authUrl;
         return;
       }
       const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
       let callbackUrl: string | null = null;
       if (result.type === 'success' && result.url) {
         callbackUrl = result.url;
       }
       let sessionId = extractSessionId(callbackUrl);
       if (!sessionId) {
         const initial = await Linking.getInitialURL();
         sessionId = extractSessionId(initial);
       }
       if (sessionId) {
         await exchangeSessionId(sessionId);
       }
     } catch (err) {
       console.log('Google sign-in error:', err);
     }
   };

   const selectRole = async (newRole: UserRole) => {
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/select-role`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
         },
         body: JSON.stringify({ role: newRole, language })
       });
       if (res.ok) {
         const data = await res.json();
         if (data.user) {
           setUser(data.user);
           setRoleState(data.user.role || newRole);
         }
         if (newRole === 'caregiver') {
           setAutoGenerateInvite(true);
         }
       }
     } catch (err) {
       console.log('Select role error:', err);
     } finally {
       setNeedRoleSelection(false);
     }
   };

   const clearAutoGenerateInvite = () => setAutoGenerateInvite(false);

   const addManualMedication = async (payload: ManualMedInput): Promise<boolean> => {
     const patientId = user?.role === 'patient' ? user.id : 'patient_ramesh_001';
     try {
       const res = await fetch(`${BACKEND_URL}/api/medications/add-manual`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ patient_id: patientId, ...payload })
       });
       if (res.ok) {
         await fetchMedications();
         await fetchTodayRoutine();
         await checkInteractions();
         return true;
       }
     } catch (err) {
       console.log('Add manual medication error:', err);
     }
     return false;
   };

   const updateProfile = async (updates: { name?: string; language?: SupportedLanguage }): Promise<boolean> => {
     if (!user) return false;
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/update-profile?user_id=${user.id}`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(updates)
       });
       if (res.ok) {
         const data = await res.json();
         if (data.user) setUser(data.user);
         if (updates.language) setLanguageState(updates.language);
         return true;
       }
     } catch (err) {
       console.log('Update profile error:', err);
     }
     return false;
   };

   const linkPhone = async (phone: string, otp: string): Promise<{ ok: boolean; message?: string }> => {
     if (!authToken) return { ok: false, message: 'Please sign in with Google first.' };
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/link-phone`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
         body: JSON.stringify({ phone, otp })
       });
       const data = await res.json();
       if (res.ok && data.user) {
         setUser(data.user);
         return { ok: true };
       }
       return { ok: false, message: data.detail || 'Could not link number.' };
     } catch (err) {
       console.log('Link phone error:', err);
       return { ok: false, message: 'Network error. Please try again.' };
     }
   };

   const loadStoredSession = async () => {
     const token = await storage.secureGet(SESSION_TOKEN_KEY, null);
     if (!token || typeof token !== 'string') return;
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
         headers: { Authorization: `Bearer ${token}` }
       });
       if (res.ok) {
         const data = await res.json();
         if (data.user && data.user.email) {
           setAuthToken(token);
           setUser(data.user);
           setRoleState(data.user.role || 'patient');
           setLanguageState(data.user.language || 'en');
           if (data.user.role_selected === false) setNeedRoleSelection(true);
         } else {
           await storage.secureRemove(SESSION_TOKEN_KEY);
         }
       } else {
         await storage.secureRemove(SESSION_TOKEN_KEY);
       }
     } catch (err) {
       console.log('Session restore error:', err);
     }
   };

   const logout = async () => {
     try {
       if (authToken) {
         await fetch(`${BACKEND_URL}/api/auth/logout`, {
           method: 'POST',
           headers: { Authorization: `Bearer ${authToken}` }
         });
       }
     } catch (err) {
       console.log('Logout error:', err);
     }
     await storage.secureRemove(SESSION_TOKEN_KEY);
     setAuthToken(null);
     setNeedRoleSelection(false);
     setUser(DEFAULT_USER);
     setRoleState('patient');
     setLanguageState('en');
   };

   // Bootstrap: process auth redirect / restore stored session on mount
   useEffect(() => {
     const bootstrap = async () => {
       setAuthLoading(true);
       if (Platform.OS === 'web' && typeof window !== 'undefined') {
         const sid = extractSessionId(window.location.href);
         if (sid) {
           await exchangeSessionId(sid);
           try {
             const clean = window.location.href
               .replace(/([?#&])session_id=[^&#]+/, '$1')
               .replace(/[?#&]$/, '');
             window.history.replaceState(window.history.state, '', clean);
           } catch (e) { /* ignore */ }
           setAuthLoading(false);
           return;
         }
       } else {
         const initial = await Linking.getInitialURL();
         const sid = extractSessionId(initial);
         if (sid) {
           await exchangeSessionId(sid);
           setAuthLoading(false);
           return;
         }
       }
       await loadStoredSession();
       setAuthLoading(false);
     };
     bootstrap();

     const sub = Linking.addEventListener('url', (event) => {
       const sid = extractSessionId(event.url);
       if (sid) exchangeSessionId(sid);
     });
     return () => sub.remove();
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

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
         signInWithGoogle,
         selectRole,
         needRoleSelection,
         authLoading,
         autoGenerateInvite,
         clearAutoGenerateInvite,
         addManualMedication,
         updateProfile,
         linkPhone,
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