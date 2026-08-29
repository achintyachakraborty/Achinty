 import React, { useState } from 'react';
 import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 
 export const HealthCheckinBar = () => {
   const { healthStatus, logHealthStatus, triggerEmergencySOS, t } = useApp();
   const [sosConfirmVisible, setSosConfirmVisible] = useState(false);
   const [symptomsModalVisible, setSymptomsModalVisible] = useState(false);
   const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
 
   const commonSymptoms = [
     "Dizziness / Lightheadedness",
     "Severe Nausea or Vomiting",
     "Chest Discomfort or Fluttering",
     "Extreme Fatigue / Weakness",
     "Shortness of Breath",
     "Skin Rash or Swelling"
   ];
 
   const toggleSymptom = (sym: string) => {
     if (selectedSymptoms.includes(sym)) {
       setSelectedSymptoms(selectedSymptoms.filter(s => s !== sym));
     } else {
       setSelectedSymptoms([...selectedSymptoms, sym]);
     }
   };
 
   const handleFeelingWell = async () => {
     setIsSubmitting(true);
     await logHealthStatus('Well');
     setIsSubmitting(false);
     setFeedbackMsg(t.healthStatus.wellConfirmation);
     setTimeout(() => setFeedbackMsg(null), 4000);
   };
 
   const handleConfirmUnwell = async () => {
     setIsSubmitting(true);
     await logHealthStatus('Unwell', selectedSymptoms);
     setIsSubmitting(false);
     setSymptomsModalVisible(false);
     setFeedbackMsg(t.healthStatus.unwellAlert);
     setTimeout(() => setFeedbackMsg(null), 5000);
   };
 
   const handleExecuteSOS = async () => {
     setIsSubmitting(true);
     await triggerEmergencySOS();
     setIsSubmitting(false);
     setSosConfirmVisible(false);
     setFeedbackMsg("🚨 Emergency SOS sent to Caregiver via WhatsApp & SMS!");
     setTimeout(() => setFeedbackMsg(null), 6000);
   };
 
   return (
     <View style={styles.wrapper}>
       {/* Toast feedback banner */}
       {feedbackMsg && (
         <View style={[styles.toastBanner, healthStatus === 'Unwell' ? styles.toastBannerAlert : styles.toastBannerSuccess]}>
           <Ionicons
             name={healthStatus === 'Unwell' ? 'warning' : 'checkmark-circle'}
             size={18}
             color="#FFFFFF"
           />
           <Text style={styles.toastText}>{feedbackMsg}</Text>
         </View>
       )}
 
       <View style={styles.container}>
         <Text style={styles.sectionTitle}>{t.healthStatus.title}</Text>
 
         {/* One-Click Daily Wellness Toggle */}
         <View style={styles.toggleRow}>
           <TouchableOpacity
             style={[styles.wellnessButton, healthStatus === 'Well' && styles.wellnessButtonActiveWell]}
             testID="feeling-well-button"
             onPress={handleFeelingWell}
             activeOpacity={0.8}
             accessibilityLabel="Report Feeling Well"
           >
             <Ionicons name="happy" size={22} color={healthStatus === 'Well' ? '#FFFFFF' : '#2D6A4F'} />
             <Text style={[styles.wellnessButtonText, healthStatus === 'Well' && styles.wellnessButtonTextActive]}>
               {t.healthStatus.feelingWell}
             </Text>
           </TouchableOpacity>
 
           <TouchableOpacity
             style={[styles.wellnessButton, styles.unwellButton, healthStatus === 'Unwell' && styles.wellnessButtonActiveUnwell]}
             testID="unwell-button"
             onPress={() => setSymptomsModalVisible(true)}
             activeOpacity={0.8}
             accessibilityLabel="Report Unwell or Discomfort"
           >
             <Ionicons name="sad" size={22} color={healthStatus === 'Unwell' ? '#FFFFFF' : '#BA3C3C'} />
             <Text style={[styles.wellnessButtonText, { color: healthStatus === 'Unwell' ? '#FFFFFF' : '#BA3C3C' }]}>
               {t.healthStatus.unwell}
             </Text>
           </TouchableOpacity>
         </View>
 
         {/* One-Touch Emergency SOS Distress Button */}
         <TouchableOpacity
           style={styles.sosButton}
           testID="emergency-sos-button"
           onPress={() => setSosConfirmVisible(true)}
           activeOpacity={0.85}
           accessibilityLabel="Trigger 1-Touch Emergency Distress SOS"
         >
           <View style={styles.sosIconCircle}>
             <Ionicons name="alert" size={20} color="#BA3C3C" />
           </View>
           <View style={{ flex: 1 }}>
             <Text style={styles.sosTitle}>{t.healthStatus.sosEmergency}</Text>
             <Text style={styles.sosSub}>{t.healthStatus.sosSubtext}</Text>
           </View>
           <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
         </TouchableOpacity>
       </View>
 
       {/* Symptoms selection modal for Unwell check-in */}
       <Modal visible={symptomsModalVisible} transparent animationType="slide">
         <View style={styles.modalOverlay}>
           <View style={styles.modalCard}>
             <View style={styles.modalHeader}>
               <View>
                 <Text style={styles.modalTitle}>Report Symptoms</Text>
                 <Text style={styles.modalSub}>This will notify your caregiver & doctor</Text>
               </View>
               <TouchableOpacity onPress={() => setSymptomsModalVisible(false)}>
                 <Ionicons name="close-circle" size={24} color="#3A3A3C" />
               </TouchableOpacity>
             </View>
 
             <View style={styles.symptomsGrid}>
               {commonSymptoms.map((sym, idx) => {
                 const isSelected = selectedSymptoms.includes(sym);
                 return (
                   <TouchableOpacity
                     key={idx}
                     style={[styles.symptomChip, isSelected && styles.symptomChipSelected]}
                     onPress={() => toggleSymptom(sym)}
                     activeOpacity={0.7}
                   >
                     <Ionicons
                       name={isSelected ? 'checkbox' : 'square-outline'}
                       size={18}
                       color={isSelected ? '#BA3C3C' : '#636366'}
                     />
                     <Text style={[styles.symptomChipText, isSelected && styles.symptomChipTextSelected]}>
                       {sym}
                     </Text>
                   </TouchableOpacity>
                 );
               })}
             </View>
 
             <TouchableOpacity
               style={styles.escalateAlertButton}
               testID="send-health-alert-button"
               onPress={handleConfirmUnwell}
               disabled={isSubmitting}
               activeOpacity={0.8}
             >
               {isSubmitting ? (
                 <ActivityIndicator color="#FFFFFF" />
               ) : (
                 <>
                   <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                   <Text style={styles.escalateAlertText}>Send Health Alert to Caregiver</Text>
                 </>
               )}
             </TouchableOpacity>
           </View>
         </View>
       </Modal>
 
       {/* SOS Confirmation Modal */}
       <Modal visible={sosConfirmVisible} transparent animationType="fade">
         <View style={styles.modalOverlay}>
           <View style={[styles.modalCard, { borderColor: '#BA3C3C', borderWidth: 2 }]}>
             <View style={{ alignItems: 'center', marginBottom: 16 }}>
               <View style={styles.sosLargeIcon}>
                 <Ionicons name="alert" size={36} color="#FFFFFF" />
               </View>
               <Text style={styles.sosModalHeading}>Trigger Emergency SOS?</Text>
               <Text style={styles.sosModalBody}>
                 This will immediately send Tier 2 emergency distress notifications to Ananya Sharma (Caregiver) and Dr. Mukherjee via WhatsApp & SMS.
               </Text>
             </View>
 
             <View style={{ gap: 10 }}>
               <TouchableOpacity
                 style={styles.confirmSosButton}
                 testID="confirm-sos-button"
                 onPress={handleExecuteSOS}
                 disabled={isSubmitting}
                 activeOpacity={0.8}
               >
                 {isSubmitting ? (
                   <ActivityIndicator color="#FFFFFF" />
                 ) : (
                   <Text style={styles.confirmSosText}>CONFIRM EMERGENCY SOS</Text>
                 )}
               </TouchableOpacity>
 
               <TouchableOpacity
                 style={styles.cancelSosButton}
                 testID="cancel-sos-button"
                 onPress={() => setSosConfirmVisible(false)}
               >
                 <Text style={styles.cancelSosText}>Cancel</Text>
               </TouchableOpacity>
             </View>
           </View>
         </View>
       </Modal>
     </View>
   );
 };
 
 const styles = StyleSheet.create({
   wrapper: {
     marginBottom: 16
   },
   container: {
     backgroundColor: '#FFFFFF',
     borderRadius: 18,
     padding: 16,
     borderWidth: 1,
     borderColor: '#E2DFD8'
   },
   sectionTitle: {
     fontSize: 14,
     fontWeight: '700',
     color: '#1C1C1E',
     marginBottom: 12,
     letterSpacing: -0.2
   },
   toggleRow: {
     flexDirection: 'row',
     gap: 12,
     marginBottom: 12
   },
   wellnessButton: {
     flex: 1,
     minHeight: 50,
     backgroundColor: '#E8ECE9',
     borderRadius: 14,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8,
     borderWidth: 1.5,
     borderColor: '#D4E2DA'
   },
   wellnessButtonActiveWell: {
     backgroundColor: '#2D6A4F',
     borderColor: '#2D6A4F'
   },
   unwellButton: {
     backgroundColor: '#FDE8E8',
     borderColor: '#F8CACA'
   },
   wellnessButtonActiveUnwell: {
     backgroundColor: '#BA3C3C',
     borderColor: '#BA3C3C'
   },
   wellnessButtonText: {
     fontSize: 13,
     fontWeight: '700',
     color: '#2D6A4F'
   },
   wellnessButtonTextActive: {
     color: '#FFFFFF'
   },
   sosButton: {
     backgroundColor: '#BA3C3C',
     borderRadius: 14,
     paddingVertical: 12,
     paddingHorizontal: 14,
     flexDirection: 'row',
     alignItems: 'center',
     gap: 12,
     minHeight: 52
   },
   sosIconCircle: {
     width: 32,
     height: 32,
     borderRadius: 16,
     backgroundColor: '#FFFFFF',
     justifyContent: 'center',
     alignItems: 'center'
   },
   sosTitle: {
     fontSize: 14,
     fontWeight: '800',
     color: '#FFFFFF',
     letterSpacing: 0.5
   },
   sosSub: {
     fontSize: 11,
     color: '#FFEAEA',
     fontWeight: '500'
   },
   toastBanner: {
     flexDirection: 'row',
     alignItems: 'center',
     padding: 12,
     borderRadius: 12,
     marginBottom: 10,
     gap: 8
   },
   toastBannerSuccess: {
     backgroundColor: '#2D6A4F'
   },
   toastBannerAlert: {
     backgroundColor: '#BA3C3C'
   },
   toastText: {
     fontSize: 13,
     fontWeight: '600',
     color: '#FFFFFF',
     flex: 1
   },
   modalOverlay: {
     flex: 1,
     backgroundColor: 'rgba(0,0,0,0.6)',
     justifyContent: 'center',
     alignItems: 'center',
     padding: 20
   },
   modalCard: {
     width: '100%',
     maxWidth: 380,
     backgroundColor: '#FFFFFF',
     borderRadius: 20,
     padding: 20
   },
   modalHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'flex-start',
     marginBottom: 16
   },
   modalTitle: {
     fontSize: 18,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   modalSub: {
     fontSize: 12,
     color: '#636366',
     marginTop: 2
   },
   symptomsGrid: {
     gap: 8,
     marginBottom: 20
   },
   symptomChip: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#F9F8F6',
     padding: 12,
     borderRadius: 10,
     gap: 10,
     minHeight: 46
   },
   symptomChipSelected: {
     backgroundColor: '#FDE8E8',
     borderColor: '#BA3C3C',
     borderWidth: 1
   },
   symptomChipText: {
     fontSize: 13,
     fontWeight: '500',
     color: '#1C1C1E'
   },
   symptomChipTextSelected: {
     color: '#BA3C3C',
     fontWeight: '700'
   },
   escalateAlertButton: {
     minHeight: 48,
     backgroundColor: '#BA3C3C',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8
   },
   escalateAlertText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   sosLargeIcon: {
     width: 64,
     height: 64,
     borderRadius: 32,
     backgroundColor: '#BA3C3C',
     justifyContent: 'center',
     alignItems: 'center',
     marginBottom: 12
   },
   sosModalHeading: {
     fontSize: 20,
     fontWeight: '800',
     color: '#BA3C3C',
     marginBottom: 8
   },
   sosModalBody: {
     fontSize: 13,
     color: '#48484A',
     textAlign: 'center',
     lineHeight: 18
   },
   confirmSosButton: {
     minHeight: 50,
     backgroundColor: '#BA3C3C',
     borderRadius: 12,
     justifyContent: 'center',
     alignItems: 'center'
   },
   confirmSosText: {
     fontSize: 14,
     fontWeight: '800',
     color: '#FFFFFF',
     letterSpacing: 0.5
   },
   cancelSosButton: {
     minHeight: 46,
     justifyContent: 'center',
     alignItems: 'center',
     backgroundColor: '#EFECE6',
     borderRadius: 12
   },
   cancelSosText: {
     fontSize: 14,
     fontWeight: '600',
     color: '#48484A'
   }
 });