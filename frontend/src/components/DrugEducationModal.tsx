 import React, { useEffect, useState } from 'react';
 import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 
 const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
 
 interface DrugEducationModalProps {
   visible: boolean;
   drugName: string;
   medicationId: string;
   onClose: () => void;
 }
 
 export const DrugEducationModal = ({ visible, drugName, medicationId, onClose }: DrugEducationModalProps) => {
   const { language, t } = useApp();
   const [data, setData] = useState<any>(null);
   const [loading, setLoading] = useState(false);
 
   useEffect(() => {
     if (visible && medicationId) {
       fetchEducation();
     }
   }, [visible, medicationId, language]);
 
   const fetchEducation = async () => {
     try {
       setLoading(true);
       const res = await fetch(`${BACKEND_URL}/api/medications/${medicationId}/education?language=${language}`);
       if (res.ok) {
         const json = await res.json();
         setData(json);
       }
     } catch (err) {
       console.log('Error fetching drug education:', err);
     } finally {
       setLoading(false);
     }
   };
 
   return (
     <Modal visible={visible} animationType="slide" transparent>
       <View style={styles.overlay}>
         <View style={styles.sheet}>
           {/* Header */}
           <View style={styles.header}>
             <View style={{ flex: 1 }}>
               <View style={styles.badgeRow}>
                 <View style={styles.aiBadge}>
                   <Ionicons name="sparkles" size={12} color="#385A49" />
                   <Text style={styles.aiBadgeText}>AI Drug Intelligence</Text>
                 </View>
                 {data?.rxcui && (
                   <View style={styles.rxcuiBadge}>
                     <Text style={styles.rxcuiText}>RxNorm: {data.rxcui}</Text>
                   </View>
                 )}
               </View>
               <Text style={styles.title}>{drugName}</Text>
               <Text style={styles.subtitle}>{data?.dosage || 'Prescribed Daily'}</Text>
             </View>
             <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
               <Ionicons name="close-circle" size={26} color="#3A3A3C" />
             </TouchableOpacity>
           </View>
 
           {loading ? (
             <View style={styles.loadingBox}>
               <ActivityIndicator size="large" color="#385A49" />
               <Text style={styles.loadingText}>Retrieving clinical mechanism & safety data...</Text>
             </View>
           ) : (
             <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
               {/* Section 1: Mechanism of Action */}
               <View style={styles.card}>
                 <View style={styles.cardHeader}>
                   <Ionicons name="body-outline" size={18} color="#385A49" />
                   <Text style={styles.cardTitle}>{t.drugEducation.mechanismTitle}</Text>
                 </View>
                 <Text style={styles.bodyText}>{data?.mechanism || 'Regulates physiological markers to maintain stable therapeutic levels.'}</Text>
               </View>
 
               {/* Section 2: Why Timely Dosing Is Critical */}
               <View style={[styles.card, { borderColor: '#D4E2DA' }]}>
                 <View style={styles.cardHeader}>
                   <Ionicons name="alarm-outline" size={18} color="#2D6A4F" />
                   <Text style={[styles.cardTitle, { color: '#2D6A4F' }]}>{t.drugEducation.whyCriticalTitle}</Text>
                 </View>
                 <Text style={styles.bodyText}>{data?.why_critical || 'Taking this medication at scheduled hours sustains optimal therapeutic concentrations.'}</Text>
               </View>
 
               {/* Section 3: Consequences of Missed Doses */}
               <View style={[styles.card, { borderColor: '#F5C2C7' }]}>
                 <View style={styles.cardHeader}>
                   <Ionicons name="warning-outline" size={18} color="#BA3C3C" />
                   <Text style={[styles.cardTitle, { color: '#BA3C3C' }]}>{t.drugEducation.consequencesTitle}</Text>
                 </View>
                 <Text style={styles.bodyText}>{data?.missed_dose_consequence || 'Missing scheduled doses causes fluctuating blood levels and reduced therapy control.'}</Text>
               </View>
 
               {/* Section 4: Administration & Food Rules */}
               <View style={styles.card}>
                 <View style={styles.cardHeader}>
                   <Ionicons name="restaurant-outline" size={18} color="#C17900" />
                   <Text style={[styles.cardTitle, { color: '#C17900' }]}>{t.drugEducation.administrationTitle}</Text>
                 </View>
                 <Text style={styles.bodyText}>{data?.meal_rule_label || 'Take with or after food with plenty of water.'}</Text>
               </View>
 
               {/* Section 5: Tier 1 Expected Mild Effects */}
               <View style={[styles.card, { backgroundColor: '#F9FBF9' }]}>
                 <View style={styles.cardHeader}>
                   <Ionicons name="shield-checkmark-outline" size={18} color="#2D6A4F" />
                   <Text style={[styles.cardTitle, { color: '#2D6A4F' }]}>{t.drugEducation.tier1Title}</Text>
                 </View>
                 {data?.tier1_side_effects?.map((se: any, i: number) => (
                   <View key={i} style={styles.tierItem}>
                     <Ionicons name="checkmark-circle" size={14} color="#2D6A4F" />
                     <View style={{ flex: 1 }}>
                       <Text style={styles.tierItemTitle}>{se.symptom}</Text>
                       <Text style={styles.tierItemNote}>{se.note}</Text>
                     </View>
                   </View>
                 ))}
               </View>
 
               {/* Section 6: Tier 2 Emergency Escalation */}
               <View style={[styles.card, { backgroundColor: '#FFF5F5', borderColor: '#F8CACA' }]}>
                 <View style={styles.cardHeader}>
                   <Ionicons name="alert-circle" size={18} color="#BA3C3C" />
                   <Text style={[styles.cardTitle, { color: '#BA3C3C' }]}>{t.drugEducation.tier2Title}</Text>
                 </View>
                 {data?.tier2_side_effects?.map((se: any, i: number) => (
                   <View key={i} style={styles.tierItem}>
                     <Ionicons name="alert" size={14} color="#BA3C3C" />
                     <View style={{ flex: 1 }}>
                       <Text style={[styles.tierItemTitle, { color: '#9B1C1C' }]}>{se.symptom}</Text>
                       <Text style={styles.tierItemNote}>{se.note}</Text>
                     </View>
                   </View>
                 ))}
               </View>
             </ScrollView>
           )}
 
           {/* Bottom Dismiss */}
           <TouchableOpacity style={styles.dismissButton} onPress={onClose} activeOpacity={0.8}>
             <Text style={styles.dismissButtonText}>Close Drug Guide</Text>
           </TouchableOpacity>
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
     maxHeight: '88%'
   },
   header: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'flex-start',
     paddingBottom: 14,
     borderBottomWidth: 1,
     borderBottomColor: '#E2DFD8'
   },
   badgeRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     marginBottom: 6
   },
   aiBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#E8ECE9',
     paddingVertical: 3,
     paddingHorizontal: 7,
     borderRadius: 6,
     gap: 4
   },
   aiBadgeText: {
     fontSize: 10,
     fontWeight: '700',
     color: '#385A49'
   },
   rxcuiBadge: {
     backgroundColor: '#EFECE6',
     paddingVertical: 3,
     paddingHorizontal: 7,
     borderRadius: 6
   },
   rxcuiText: {
     fontSize: 10,
     color: '#48484A',
     fontWeight: '600'
   },
   title: {
     fontSize: 22,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   subtitle: {
     fontSize: 13,
     color: '#636366',
     marginTop: 2
   },
   loadingBox: {
     padding: 40,
     alignItems: 'center',
     justifyContent: 'center',
     gap: 12
   },
   loadingText: {
     fontSize: 13,
     color: '#636366'
   },
   scrollContent: {
     paddingVertical: 16,
     gap: 12
   },
   card: {
     backgroundColor: '#FFFFFF',
     borderRadius: 14,
     padding: 14,
     borderWidth: 1,
     borderColor: '#E2DFD8'
   },
   cardHeader: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     marginBottom: 8
   },
   cardTitle: {
     fontSize: 14,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   bodyText: {
     fontSize: 13,
     color: '#3A3A3C',
     lineHeight: 19
   },
   tierItem: {
     flexDirection: 'row',
     alignItems: 'flex-start',
     gap: 8,
     marginTop: 8
   },
   tierItemTitle: {
     fontSize: 13,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   tierItemNote: {
     fontSize: 11,
     color: '#636366',
     marginTop: 1
   },
   dismissButton: {
     minHeight: 48,
     backgroundColor: '#385A49',
     borderRadius: 12,
     justifyContent: 'center',
     alignItems: 'center',
     marginTop: 10
   },
   dismissButtonText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   }
 });