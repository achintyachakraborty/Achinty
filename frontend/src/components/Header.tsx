 import React, { useState } from 'react';
 import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 import { SupportedLanguage, UserRole } from '../types';
 
 export const Header = ({ onOpenAuth }: { onOpenAuth: () => void }) => {
   const { user, role, language, setLanguage, switchDemoUser, t } = useApp();
   const [langModalVisible, setLangModalVisible] = useState(false);
   const [roleModalVisible, setRoleModalVisible] = useState(false);
 
   const langLabels: Record<SupportedLanguage, { label: string; flag: string }> = {
     en: { label: 'English', flag: '🇬🇧' },
     hi: { label: 'हिन्दी', flag: '🇮🇳' },
     bn: { label: 'বাংলা', flag: '🇮🇳' }
   };
 
   const roleLabels: Record<UserRole, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
     patient: { label: t.roles.patient, icon: 'person' },
     caregiver: { label: t.roles.caregiver, icon: 'heart-half' },
     pharmacist: { label: t.roles.pharmacist, icon: 'medkit' },
     clinic: { label: t.roles.clinic, icon: 'business' }
   };
 
   return (
     <View style={styles.container}>
       <View style={styles.topRow}>
         <View style={styles.brandContainer}>
           <View style={styles.logoBadge}>
             <Ionicons name="medical" size={18} color="#FFFFFF" />
           </View>
           <View>
             <Text style={styles.appName}>{t.appName}</Text>
             <Text style={styles.tagline}>{user?.name || t.appTagline}</Text>
           </View>
         </View>
 
         <View style={styles.actionsRow}>
           {/* Language Selector */}
           <TouchableOpacity
             style={styles.pillButton}
             testID="language-selector-button"
             onPress={() => setLangModalVisible(true)}
             activeOpacity={0.7}
             accessibilityLabel="Select language"
           >
             <Ionicons name="globe-outline" size={16} color="#385A49" />
             <Text style={styles.pillText}>{langLabels[language].label}</Text>
           </TouchableOpacity>
 
           {/* Role Switcher */}
           <TouchableOpacity
             style={[styles.pillButton, styles.rolePill]}
             testID="role-switcher-button"
             onPress={() => setRoleModalVisible(true)}
             activeOpacity={0.7}
             accessibilityLabel="Switch active portal"
           >
             <Ionicons name={roleLabels[role].icon} size={15} color="#FFFFFF" />
             <Text style={styles.rolePillText}>{role.toUpperCase()}</Text>
           </TouchableOpacity>
         </View>
       </View>
 
       {/* Language Picker Modal */}
       <Modal visible={langModalVisible} transparent animationType="fade">
         <View style={styles.modalOverlay}>
           <View style={styles.modalContent}>
             <View style={styles.modalHeader}>
               <Text style={styles.modalTitle}>Choose Language / भाषा चुनें</Text>
               <TouchableOpacity onPress={() => setLangModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                 <Ionicons name="close-circle" size={24} color="#3A3A3C" />
               </TouchableOpacity>
             </View>
 
             {(['en', 'hi', 'bn'] as SupportedLanguage[]).map((lang) => (
               <TouchableOpacity
                 key={lang}
                 testID={`language-option-${lang}`}
                 style={[styles.modalOption, language === lang && styles.modalOptionActive]}
                 onPress={() => {
                   setLanguage(lang);
                   setLangModalVisible(false);
                 }}
               >
                 <Text style={styles.optionEmoji}>{langLabels[lang].flag}</Text>
                 <Text style={[styles.optionLabel, language === lang && styles.optionLabelActive]}>
                   {langLabels[lang].label}
                 </Text>
                 {language === lang && <Ionicons name="checkmark-circle" size={20} color="#385A49" />}
               </TouchableOpacity>
             ))}
           </View>
         </View>
       </Modal>
 
       {/* Role Switcher Modal */}
       <Modal visible={roleModalVisible} transparent animationType="fade">
         <View style={styles.modalOverlay}>
           <View style={styles.modalContent}>
             <View style={styles.modalHeader}>
               <Text style={styles.modalTitle}>Select Dashboard View</Text>
               <TouchableOpacity onPress={() => setRoleModalVisible(false)}>
                 <Ionicons name="close-circle" size={24} color="#3A3A3C" />
               </TouchableOpacity>
             </View>
 
             {(['patient', 'caregiver', 'pharmacist', 'clinic'] as UserRole[]).map((r) => (
               <TouchableOpacity
                 key={r}
                 testID={`role-option-${r}`}
                 style={[styles.modalOption, role === r && styles.modalOptionActive]}
                 onPress={() => {
                   switchDemoUser(r);
                   setRoleModalVisible(false);
                 }}
               >
                 <View style={[styles.roleIconBadge, role === r && styles.roleIconBadgeActive]}>
                   <Ionicons name={roleLabels[r].icon} size={18} color={role === r ? '#FFFFFF' : '#385A49'} />
                 </View>
                 <View style={{ flex: 1 }}>
                   <Text style={[styles.optionLabel, role === r && styles.optionLabelActive]}>
                     {roleLabels[r].label}
                   </Text>
                   <Text style={styles.roleSubtext}>
                     {r === 'patient' && 'Daily pills, meal rules & AI drug mechanism'}
                     {r === 'caregiver' && 'Family compliance tracker & WhatsApp invite link'}
                     {r === 'pharmacist' && '7-14 day refill queue & auto-dispatch engine'}
                     {r === 'clinic' && 'Doctor oversight, DDI matrix & adherence trends'}
                   </Text>
                 </View>
                 {role === r && <Ionicons name="checkmark-circle" size={20} color="#385A49" />}
               </TouchableOpacity>
             ))}
 
             <TouchableOpacity
               style={styles.loginModalButton}
               testID="open-otp-login-button"
               onPress={() => {
                 setRoleModalVisible(false);
                 onOpenAuth();
               }}
             >
               <Ionicons name="key-outline" size={18} color="#385A49" />
               <Text style={styles.loginModalButtonText}>Passwordless Mobile Login (OTP)</Text>
             </TouchableOpacity>
           </View>
         </View>
       </Modal>
     </View>
   );
 };
 
 const styles = StyleSheet.create({
   container: {
     backgroundColor: '#F9F8F6',
     paddingTop: 8,
     paddingBottom: 12,
     paddingHorizontal: 16,
     borderBottomWidth: 1,
     borderBottomColor: '#E2DFD8'
   },
   topRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center'
   },
   brandContainer: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 10
   },
   logoBadge: {
     width: 36,
     height: 36,
     borderRadius: 10,
     backgroundColor: '#385A49',
     justifyContent: 'center',
     alignItems: 'center'
   },
   appName: {
     fontSize: 18,
     fontWeight: '700',
     color: '#1C1C1E',
     letterSpacing: -0.3
   },
   tagline: {
     fontSize: 12,
     color: '#48484A',
     fontWeight: '500'
   },
   actionsRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8
   },
   pillButton: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#E8ECE9',
     paddingVertical: 7,
     paddingHorizontal: 10,
     borderRadius: 999,
     gap: 5,
     minHeight: 38
   },
   pillText: {
     fontSize: 12,
     fontWeight: '600',
     color: '#385A49'
   },
   rolePill: {
     backgroundColor: '#385A49'
   },
   rolePillText: {
     fontSize: 11,
     fontWeight: '700',
     color: '#FFFFFF',
     letterSpacing: 0.5
   },
   modalOverlay: {
     flex: 1,
     backgroundColor: 'rgba(0,0,0,0.5)',
     justifyContent: 'center',
     alignItems: 'center',
     padding: 20
   },
   modalContent: {
     width: '100%',
     maxWidth: 380,
     backgroundColor: '#FFFFFF',
     borderRadius: 20,
     padding: 20,
     shadowColor: '#000',
     shadowOffset: { width: 0, height: 4 },
     shadowOpacity: 0.15,
     shadowRadius: 12,
     elevation: 8
   },
   modalHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 16
   },
   modalTitle: {
     fontSize: 17,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   modalOption: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingVertical: 12,
     paddingHorizontal: 12,
     borderRadius: 12,
     marginBottom: 8,
     backgroundColor: '#F9F8F6',
     minHeight: 48,
     gap: 12
   },
   modalOptionActive: {
     backgroundColor: '#E8ECE9',
     borderColor: '#385A49',
     borderWidth: 1.5
   },
   optionEmoji: {
     fontSize: 22
   },
   optionLabel: {
     fontSize: 15,
     fontWeight: '600',
     color: '#1C1C1E'
   },
   optionLabelActive: {
     color: '#385A49',
     fontWeight: '700'
   },
   roleIconBadge: {
     width: 32,
     height: 32,
     borderRadius: 8,
     backgroundColor: '#E8ECE9',
     justifyContent: 'center',
     alignItems: 'center'
   },
   roleIconBadgeActive: {
     backgroundColor: '#385A49'
   },
   roleSubtext: {
     fontSize: 11,
     color: '#636366',
     marginTop: 2
   },
   loginModalButton: {
     marginTop: 12,
     paddingVertical: 12,
     borderRadius: 12,
     backgroundColor: '#E8ECE9',
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8,
     minHeight: 48
   },
   loginModalButtonText: {
     fontSize: 14,
     fontWeight: '600',
     color: '#385A49'
   }
 });