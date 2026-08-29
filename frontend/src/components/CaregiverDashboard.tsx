 import React, { useState } from 'react';
 import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Linking } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 
 export const CaregiverDashboard = () => {
   const { user, complianceScore, alertLogs, createMagicInviteLink, t } = useApp();
   const [patientName, setPatientName] = useState('Ramesh Sharma');
   const [magicResult, setMagicResult] = useState<{ code: string; magic_link: string; whatsapp_template: string } | null>(null);
   const [copied, setCopied] = useState(false);
 
   const handleGenerateLink = async () => {
     const res = await createMagicInviteLink(patientName);
     setMagicResult(res);
   };
 
   const handleOpenWhatsApp = () => {
     if (magicResult?.whatsapp_template) {
       const url = `whatsapp://send?text=${encodeURIComponent(magicResult.whatsapp_template)}`;
       Linking.openURL(url).catch(() => {
         // Fallback web url
         Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(magicResult.whatsapp_template)}`);
       });
     }
   };
 
   return (
     <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
       {/* Header Card */}
       <View style={styles.headerCard}>
         <View style={styles.headerTop}>
           <View>
             <Text style={styles.caregiverTitle}>{t.caregiver.title}</Text>
             <Text style={styles.caregiverSub}>{t.caregiver.subtitle}</Text>
           </View>
           <View style={styles.linkedBadge}>
             <Ionicons name="link" size={14} color="#2D6A4F" />
             <Text style={styles.linkedText}>Active Link</Text>
           </View>
         </View>
 
         {/* Patient Scorecard */}
         <View style={styles.scorecard}>
           <View style={styles.scoreLeft}>
             <Text style={styles.patientNameLabel}>Monitored Patient</Text>
             <Text style={styles.patientNameValue}>Ramesh Sharma (Father, 68)</Text>
             <Text style={styles.patientCondition}>Hypertension & Glycemic Routine</Text>
           </View>
           <View style={styles.scoreCircle}>
             <Text style={styles.scoreNumber}>{complianceScore}%</Text>
             <Text style={styles.scoreLabel}>{t.caregiver.patientScore}</Text>
           </View>
         </View>
       </View>
 
       {/* WhatsApp Magic Invite Link Generator */}
       <View style={styles.magicLinkCard}>
         <View style={styles.cardHeaderRow}>
           <View style={styles.whatsappIconCircle}>
             <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
           </View>
           <View style={{ flex: 1 }}>
             <Text style={styles.magicTitle}>{t.caregiver.magicLinkTitle}</Text>
             <Text style={styles.magicSub}>{t.caregiver.magicLinkDesc}</Text>
           </View>
         </View>
 
         <View style={styles.inviteInputBox}>
           <Text style={styles.inputLabel}>Family Member / Patient Name</Text>
           <TextInput
             style={styles.textInput}
             value={patientName}
             onChangeText={setPatientName}
             placeholder="e.g. Papa / Ramesh Sharma"
           />
         </View>
 
         <TouchableOpacity
           style={styles.generateButton}
           testID="generate-magic-link-button"
           onPress={handleGenerateLink}
           activeOpacity={0.8}
         >
           <Ionicons name="sparkles" size={16} color="#FFFFFF" />
           <Text style={styles.generateButtonText}>{t.caregiver.generateLink}</Text>
         </TouchableOpacity>
 
         {magicResult && (
           <View style={styles.magicResultBox}>
             <View style={styles.codeRow}>
               <Text style={styles.codeLabel}>Auto-Link Code:</Text>
               <Text style={styles.codeValue}>{magicResult.code}</Text>
             </View>
             <Text style={styles.linkText} numberOfLines={1}>{magicResult.magic_link}</Text>
 
             <TouchableOpacity
               style={styles.whatsappShareButton}
               testID="dispatch-whatsapp-button"
               onPress={handleOpenWhatsApp}
               activeOpacity={0.8}
             >
               <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
               <Text style={styles.whatsappShareText}>Dispatch via WhatsApp to Patient</Text>
             </TouchableOpacity>
           </View>
         )}
       </View>
 
       {/* Real-time Alert Dispatches Log */}
       <View style={styles.alertsCard}>
         <View style={styles.alertsHeader}>
           <Ionicons name="notifications-outline" size={18} color="#385A49" />
           <Text style={styles.alertsTitle}>{t.caregiver.alertHistory}</Text>
         </View>
 
         {alertLogs.length === 0 ? (
           <Text style={styles.emptyAlertsText}>No emergency dispatches recorded today.</Text>
         ) : (
           alertLogs.map((log, idx) => (
             <View key={idx} style={styles.alertLogItem}>
               <View style={styles.alertLogTop}>
                 <View style={[styles.channelBadge, log.channel === 'WhatsApp' ? styles.chWhatsApp : log.channel === 'SMS' ? styles.chSms : styles.chPush]}>
                   <Text style={styles.channelText}>{log.channel}</Text>
                 </View>
                 <Text style={styles.alertType}>{log.alert_type}</Text>
                 <Text style={styles.alertStatus}>{log.delivery_status}</Text>
               </View>
               <Text style={styles.alertPayload}>{log.message_payload}</Text>
             </View>
           ))
         )}
       </View>
     </ScrollView>
   );
 };
 
 const styles = StyleSheet.create({
   container: {
     paddingHorizontal: 16,
     paddingTop: 12,
     paddingBottom: 24,
     gap: 14
   },
   headerCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 18,
     padding: 16,
     borderWidth: 1,
     borderColor: '#E2DFD8'
   },
   headerTop: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'flex-start',
     marginBottom: 14
   },
   caregiverTitle: {
     fontSize: 18,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   caregiverSub: {
     fontSize: 12,
     color: '#636366',
     marginTop: 2
   },
   linkedBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#E6F4EA',
     paddingVertical: 4,
     paddingHorizontal: 8,
     borderRadius: 6,
     gap: 4
   },
   linkedText: {
     fontSize: 11,
     fontWeight: '700',
     color: '#2D6A4F'
   },
   scorecard: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     backgroundColor: '#F9F8F6',
     borderRadius: 14,
     padding: 12
   },
   scoreLeft: {
     flex: 1
   },
   patientNameLabel: {
     fontSize: 10,
     fontWeight: '700',
     color: '#48484A',
     textTransform: 'uppercase'
   },
   patientNameValue: {
     fontSize: 15,
     fontWeight: '700',
     color: '#1C1C1E',
     marginTop: 2
   },
   patientCondition: {
     fontSize: 12,
     color: '#636366',
     marginTop: 2
   },
   scoreCircle: {
     width: 68,
     height: 68,
     borderRadius: 34,
     backgroundColor: '#2D6A4F',
     justifyContent: 'center',
     alignItems: 'center',
     padding: 4
   },
   scoreNumber: {
     fontSize: 18,
     fontWeight: '800',
     color: '#FFFFFF'
   },
   scoreLabel: {
     fontSize: 8,
     fontWeight: '700',
     color: '#E8F5E9',
     textAlign: 'center'
   },
   magicLinkCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 18,
     padding: 16,
     borderWidth: 1,
     borderColor: '#E2DFD8'
   },
   cardHeaderRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 12,
     marginBottom: 12
   },
   whatsappIconCircle: {
     width: 36,
     height: 36,
     borderRadius: 18,
     backgroundColor: '#25D366',
     justifyContent: 'center',
     alignItems: 'center'
   },
   magicTitle: {
     fontSize: 15,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   magicSub: {
     fontSize: 12,
     color: '#636366',
     marginTop: 2,
     lineHeight: 16
   },
   inviteInputBox: {
     marginBottom: 12
   },
   inputLabel: {
     fontSize: 11,
     fontWeight: '600',
     color: '#48484A',
     marginBottom: 4
   },
   textInput: {
     backgroundColor: '#F9F8F6',
     borderWidth: 1,
     borderColor: '#E2DFD8',
     borderRadius: 10,
     paddingHorizontal: 12,
     paddingVertical: 10,
     fontSize: 14,
     color: '#1C1C1E'
   },
   generateButton: {
     minHeight: 48,
     backgroundColor: '#385A49',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8
   },
   generateButtonText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   magicResultBox: {
     marginTop: 14,
     backgroundColor: '#F9FBF9',
     borderRadius: 12,
     padding: 12,
     borderWidth: 1,
     borderColor: '#CDE5D8'
   },
   codeRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 6
   },
   codeLabel: {
     fontSize: 12,
     color: '#48484A',
     fontWeight: '600'
   },
   codeValue: {
     fontSize: 16,
     fontWeight: '800',
     color: '#385A49',
     letterSpacing: 1
   },
   linkText: {
     fontSize: 11,
     color: '#636366',
     marginBottom: 10
   },
   whatsappShareButton: {
     minHeight: 46,
     backgroundColor: '#25D366',
     borderRadius: 10,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8
   },
   whatsappShareText: {
     fontSize: 13,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   alertsCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 18,
     padding: 16,
     borderWidth: 1,
     borderColor: '#E2DFD8'
   },
   alertsHeader: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     marginBottom: 12
   },
   alertsTitle: {
     fontSize: 15,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   emptyAlertsText: {
     fontSize: 12,
     color: '#8E8E93',
     fontStyle: 'italic',
     paddingVertical: 8
   },
   alertLogItem: {
     backgroundColor: '#F9F8F6',
     borderRadius: 10,
     padding: 10,
     marginBottom: 8
   },
   alertLogTop: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     marginBottom: 4
   },
   channelBadge: {
     paddingVertical: 2,
     paddingHorizontal: 6,
     borderRadius: 4
   },
   chWhatsApp: {
     backgroundColor: '#D1F4D9'
   },
   chSms: {
     backgroundColor: '#E6F0FA'
   },
   chPush: {
     backgroundColor: '#EFECE6'
   },
   channelText: {
     fontSize: 10,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   alertType: {
     fontSize: 11,
     fontWeight: '700',
     color: '#385A49',
     flex: 1
   },
   alertStatus: {
     fontSize: 10,
     color: '#2D6A4F',
     fontWeight: '700'
   },
   alertPayload: {
     fontSize: 12,
     color: '#3A3A3C',
     lineHeight: 16
   }
 });