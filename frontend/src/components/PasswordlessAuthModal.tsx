 import React, { useState } from 'react';
 import {
   View,
   Text,
   StyleSheet,
   Modal,
   TouchableOpacity,
   TextInput,
   ActivityIndicator,
   ScrollView
 } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 import { UserRole } from '../types';
 
 const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
 
 interface PasswordlessAuthModalProps {
   visible: boolean;
   onClose: () => void;
 }
 
 export const PasswordlessAuthModal = ({ visible, onClose }: PasswordlessAuthModalProps) => {
   const { loginWithOtp, switchDemoUser, signInWithGoogle, language, t } = useApp();
   const [step, setStep] = useState<'phone' | 'otp'>('phone');
   const [phone, setPhone] = useState('+919876543210');
   const [otp, setOtp] = useState('123456');
   const [selectedRole, setSelectedRole] = useState<UserRole>('patient');
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
 
   const handleSendOtp = async () => {
     if (!phone.trim()) {
       setError('Please enter a valid mobile number');
       return;
     }
     setError(null);
     setIsLoading(true);
     try {
       const res = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ phone, role: selectedRole, language })
       });
       if (res.ok) {
         setStep('otp');
       } else {
         setError('Failed to dispatch OTP. Please retry.');
       }
     } catch (err) {
       setError('Network connection error.');
     } finally {
       setIsLoading(false);
     }
   };
 
   const handleVerifyOtp = async () => {
     setIsLoading(true);
     setError(null);
     const success = await loginWithOtp(phone, otp, selectedRole);
     setIsLoading(false);
     if (success) {
       onClose();
     } else {
       setError('Invalid OTP code. Try 123456 for demo.');
     }
   };
 
   const handleInstantDemoLogin = async (targetRole: UserRole) => {
     setIsLoading(true);
     await switchDemoUser(targetRole);
     setIsLoading(false);
     onClose();
   };
 
   return (
     <Modal visible={visible} animationType="slide" transparent>
       <View style={styles.overlay}>
         <View style={styles.sheet}>
           {/* Top Bar */}
           <View style={styles.header}>
             <View style={{ flex: 1 }}>
               <Text style={styles.title}>{t.auth.welcome}</Text>
               <Text style={styles.subtitle}>{t.auth.subtitle}</Text>
             </View>
             <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
               <Ionicons name="close-circle" size={26} color="#3A3A3C" />
             </TouchableOpacity>
           </View>
 
           <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
             {/* Continue with Google (Emergent-managed) */}
             <TouchableOpacity
               style={styles.googleButton}
               testID="google-signin-button"
               onPress={() => {
                 onClose();
                 signInWithGoogle();
               }}
               activeOpacity={0.8}
             >
               <Ionicons name="logo-google" size={18} color="#385A49" />
               <Text style={styles.googleButtonText}>Continue with Google</Text>
             </TouchableOpacity>

             <View style={styles.dividerRow}>
               <View style={styles.dividerLine} />
               <Text style={styles.dividerText}>or</Text>
               <View style={styles.dividerLine} />
             </View>

             {/* Instant Quick Demo Profiles Bar */}
             <View style={styles.demoBox}>
               <Text style={styles.demoTitle}>⚡ Instant Demo Switcher</Text>
               <View style={styles.demoButtonsGrid}>
                 <TouchableOpacity
                   style={styles.demoButton}
                   testID="demo-login-patient"
                   onPress={() => handleInstantDemoLogin('patient')}
                 >
                   <Ionicons name="person" size={14} color="#385A49" />
                   <Text style={styles.demoButtonText}>Patient (Ramesh)</Text>
                 </TouchableOpacity>
 
                 <TouchableOpacity
                   style={styles.demoButton}
                   testID="demo-login-caregiver"
                   onPress={() => handleInstantDemoLogin('caregiver')}
                 >
                   <Ionicons name="heart" size={14} color="#385A49" />
                   <Text style={styles.demoButtonText}>Caregiver (Ananya)</Text>
                 </TouchableOpacity>
 
                 <TouchableOpacity
                   style={styles.demoButton}
                   testID="demo-login-pharmacist"
                   onPress={() => handleInstantDemoLogin('pharmacist')}
                 >
                   <Ionicons name="medkit" size={14} color="#385A49" />
                   <Text style={styles.demoButtonText}>Pharmacist (MedPlus)</Text>
                 </TouchableOpacity>
 
                 <TouchableOpacity
                   style={styles.demoButton}
                   testID="demo-login-clinic"
                   onPress={() => handleInstantDemoLogin('clinic')}
                 >
                   <Ionicons name="business" size={14} color="#385A49" />
                   <Text style={styles.demoButtonText}>Doctor (Dr. Mukherjee)</Text>
                 </TouchableOpacity>
               </View>
             </View>
 
             {error && (
               <View style={styles.errorBox}>
                 <Ionicons name="alert-circle" size={16} color="#BA3C3C" />
                 <Text style={styles.errorText}>{error}</Text>
               </View>
             )}
 
             {step === 'phone' ? (
               <View style={styles.formContainer}>
                 {/* Role Selection */}
                 <Text style={styles.fieldLabel}>Who are you logging in as?</Text>
                 <View style={styles.rolesRow}>
                   {(['patient', 'caregiver', 'pharmacist', 'clinic'] as UserRole[]).map((r) => (
                     <TouchableOpacity
                       key={r}
                       style={[styles.roleSelectChip, selectedRole === r && styles.roleSelectChipActive]}
                       onPress={() => setSelectedRole(r)}
                     >
                       <Text style={[styles.roleSelectText, selectedRole === r && styles.roleSelectTextActive]}>
                         {r.toUpperCase()}
                       </Text>
                     </TouchableOpacity>
                   ))}
                 </View>
 
                 {/* Phone Number Field */}
                 <Text style={[styles.fieldLabel, { marginTop: 14 }]}>{t.auth.enterPhone}</Text>
                 <View style={styles.inputBox}>
                   <Ionicons name="call-outline" size={18} color="#385A49" />
                   <TextInput
                     style={styles.input}
                     testID="phone-input"
                     value={phone}
                     onChangeText={setPhone}
                     placeholder="+919876543210"
                     keyboardType="phone-pad"
                   />
                 </View>
 
                 <TouchableOpacity
                   style={styles.actionButton}
                   testID="send-otp-button"
                   onPress={handleSendOtp}
                   disabled={isLoading}
                   activeOpacity={0.8}
                 >
                   {isLoading ? (
                     <ActivityIndicator color="#FFFFFF" />
                   ) : (
                     <>
                       <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                       <Text style={styles.actionButtonText}>{t.auth.sendOtp}</Text>
                     </>
                   )}
                 </TouchableOpacity>
               </View>
             ) : (
               <View style={styles.formContainer}>
                 <Text style={styles.fieldLabel}>{t.auth.enterOtp}</Text>
                 <Text style={styles.otpNotice}>Sent to {phone} (Demo Code: 123456)</Text>
 
                 <View style={styles.inputBox}>
                   <Ionicons name="lock-closed-outline" size={18} color="#385A49" />
                   <TextInput
                     style={styles.input}
                     testID="otp-input"
                     value={otp}
                     onChangeText={setOtp}
                     placeholder="123456"
                     keyboardType="number-pad"
                     maxLength={6}
                   />
                 </View>
 
                 <TouchableOpacity
                   style={styles.actionButton}
                   testID="verify-otp-button"
                   onPress={handleVerifyOtp}
                   disabled={isLoading}
                   activeOpacity={0.8}
                 >
                   {isLoading ? (
                     <ActivityIndicator color="#FFFFFF" />
                   ) : (
                     <>
                       <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                       <Text style={styles.actionButtonText}>{t.auth.verifyOtp}</Text>
                     </>
                   )}
                 </TouchableOpacity>
 
                 <TouchableOpacity
                   style={styles.backButton}
                   onPress={() => setStep('phone')}
                 >
                   <Text style={styles.backButtonText}>← Edit Phone Number</Text>
                 </TouchableOpacity>
               </View>
             )}
           </ScrollView>
         </View>
       </View>
     </Modal>
   );
 };
 
 const styles = StyleSheet.create({
   overlay: {
     flex: 1,
     backgroundColor: 'rgba(0,0,0,0.5)',
     justifyContent: 'flex-end'
   },
   sheet: {
     backgroundColor: '#FFFFFF',
     borderTopLeftRadius: 24,
     borderTopRightRadius: 24,
     paddingTop: 16,
     paddingHorizontal: 20,
     paddingBottom: 24,
     maxHeight: '90%'
   },
   header: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'flex-start',
     paddingBottom: 12,
     borderBottomWidth: 1,
     borderBottomColor: '#E2DFD8'
   },
   title: {
     fontSize: 18,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   subtitle: {
     fontSize: 12,
     color: '#636366',
     marginTop: 2
   },
   content: {
     paddingVertical: 14,
     gap: 14
   },
   googleButton: {
     minHeight: 50,
     backgroundColor: '#FFFFFF',
     borderRadius: 12,
     borderWidth: 1.5,
     borderColor: '#385A49',
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 10
   },
   googleButtonText: {
     fontSize: 15,
     fontWeight: '700',
     color: '#385A49'
   },
   dividerRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 10
   },
   dividerLine: {
     flex: 1,
     height: 1,
     backgroundColor: '#E2DFD8'
   },
   dividerText: {
     fontSize: 12,
     fontWeight: '600',
     color: '#8E8E93'
   },
   demoBox: {
     backgroundColor: '#F9FBF9',
     borderRadius: 14,
     padding: 12,
     borderWidth: 1,
     borderColor: '#CDE5D8'
   },
   demoTitle: {
     fontSize: 12,
     fontWeight: '700',
     color: '#2D6A4F',
     marginBottom: 8
   },
   demoButtonsGrid: {
     flexDirection: 'row',
     flexWrap: 'wrap',
     gap: 8
   },
   demoButton: {
     backgroundColor: '#FFFFFF',
     borderRadius: 8,
     paddingVertical: 6,
     paddingHorizontal: 10,
     borderWidth: 1,
     borderColor: '#CDE5D8',
     flexDirection: 'row',
     alignItems: 'center',
     gap: 6
   },
   demoButtonText: {
     fontSize: 11,
     fontWeight: '700',
     color: '#385A49'
   },
   errorBox: {
     backgroundColor: '#FFF5F5',
     borderRadius: 10,
     padding: 10,
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     borderWidth: 1,
     borderColor: '#F8CACA'
   },
   errorText: {
     fontSize: 12,
     color: '#BA3C3C',
     fontWeight: '600'
   },
   formContainer: {
     gap: 8
   },
   fieldLabel: {
     fontSize: 13,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   rolesRow: {
     flexDirection: 'row',
     gap: 6,
     marginTop: 4
   },
   roleSelectChip: {
     flex: 1,
     paddingVertical: 8,
     borderRadius: 8,
     backgroundColor: '#F9F8F6',
     borderWidth: 1,
     borderColor: '#E2DFD8',
     alignItems: 'center',
     justifyContent: 'center'
   },
   roleSelectChipActive: {
     backgroundColor: '#385A49',
     borderColor: '#385A49'
   },
   roleSelectText: {
     fontSize: 10,
     fontWeight: '700',
     color: '#48484A'
   },
   roleSelectTextActive: {
     color: '#FFFFFF'
   },
   inputBox: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#F9F8F6',
     borderRadius: 12,
     borderWidth: 1,
     borderColor: '#E2DFD8',
     paddingHorizontal: 12,
     gap: 8,
     minHeight: 48,
     marginTop: 4
   },
   input: {
     flex: 1,
     fontSize: 15,
     color: '#1C1C1E'
   },
   otpNotice: {
     fontSize: 12,
     color: '#636366',
     marginTop: 2
   },
   actionButton: {
     minHeight: 50,
     backgroundColor: '#385A49',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8,
     marginTop: 12
   },
   actionButtonText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   backButton: {
     alignItems: 'center',
     paddingVertical: 8,
     marginTop: 4
   },
   backButtonText: {
     fontSize: 13,
     color: '#385A49',
     fontWeight: '600'
   }
 });