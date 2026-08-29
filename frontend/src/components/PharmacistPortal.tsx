 import React, { useState } from 'react';
 import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 import { RefillOrder } from '../types';
 
 export const PharmacistPortal = () => {
   const { refillQueue, processRefillOrder, t } = useApp();
   const [processingId, setProcessingId] = useState<string | null>(null);
   const [filter, setFilter] = useState<'all' | 'due_soon' | 'dispatched'>('all');
 
   const handleDispatch = async (id: string) => {
     setProcessingId(id);
     await processRefillOrder(id);
     setProcessingId(null);
   };
 
   const filteredQueue = refillQueue.filter(item => {
     if (filter === 'all') return true;
     return item.status === filter;
   });
 
   return (
     <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
       {/* Header & Pharmacy Hub Profile */}
       <View style={styles.headerCard}>
         <View style={styles.pharmacyTop}>
           <View style={styles.pharmacyIconBox}>
             <Ionicons name="medkit" size={24} color="#FFFFFF" />
           </View>
           <View style={{ flex: 1 }}>
             <Text style={styles.pharmacyName}>MedPlus Health Hub #42</Text>
             <Text style={styles.licenseText}>License: PHARM-2024-WB-8812 • Verified B2B Node</Text>
           </View>
         </View>
 
         {/* Analytics Row */}
         <View style={styles.analyticsGrid}>
           <View style={styles.metricCard}>
             <Text style={styles.metricNumber}>97.4%</Text>
             <Text style={styles.metricLabel}>{t.pharmacist.fulfillmentRate}</Text>
           </View>
           <View style={styles.metricCard}>
             <Text style={styles.metricNumber}>94.8%</Text>
             <Text style={styles.metricLabel}>{t.pharmacist.retentionScore}</Text>
           </View>
           <View style={styles.metricCard}>
             <Text style={[styles.metricNumber, { color: '#C17900' }]}>{refillQueue.length}</Text>
             <Text style={styles.metricLabel}>Active 7-14d Queue</Text>
           </View>
         </View>
       </View>
 
       {/* Queue Controls & Filter Tabs */}
       <View style={styles.queueHeader}>
         <View>
           <Text style={styles.queueTitle}>{t.pharmacist.refillQueue}</Text>
           <Text style={styles.queueSub}>{t.pharmacist.subtitle}</Text>
         </View>
       </View>
 
       {/* Refill Order Items */}
       {filteredQueue.length === 0 ? (
         <View style={styles.emptyCard}>
           <Ionicons name="checkmark-circle-outline" size={36} color="#2D6A4F" />
           <Text style={styles.emptyTitle}>All upcoming refills are up to date</Text>
         </View>
       ) : (
         filteredQueue.map((item) => {
           const isDispatched = item.status === 'dispatched';
           const isUrgent = item.days_remaining <= 5;
 
           return (
             <View key={item.id} style={[styles.refillCard, isUrgent && styles.refillCardUrgent]}>
               <View style={styles.cardTop}>
                 <View>
                   <Text style={styles.patientName}>{item.patient_name}</Text>
                   <Text style={styles.patientPhone}>{item.patient_phone}</Text>
                 </View>
                 <View style={[styles.urgencyBadge, isUrgent ? styles.urgencyHigh : styles.urgencyNormal]}>
                   <Ionicons name={isUrgent ? 'time' : 'calendar-outline'} size={12} color={isUrgent ? '#BA3C3C' : '#385A49'} />
                   <Text style={[styles.urgencyText, { color: isUrgent ? '#BA3C3C' : '#385A49' }]}>
                     {item.days_remaining} Days Left
                   </Text>
                 </View>
               </View>
 
               <View style={styles.drugInfoRow}>
                 <Ionicons name="medical" size={18} color="#385A49" />
                 <Text style={styles.drugNameText}>{item.drug_name}</Text>
               </View>
 
               <View style={styles.stockRow}>
                 <View style={styles.stockBadge}>
                   <Ionicons name="checkmark-circle" size={14} color="#2D6A4F" />
                   <Text style={styles.stockBadgeText}>Inventory Verified ({t.pharmacist.stockAvailable})</Text>
                 </View>
                 <Text style={styles.refillDueDate}>Due: {item.refill_due_date}</Text>
               </View>
 
               {/* Dispatch Button */}
               <TouchableOpacity
                 style={[styles.dispatchButton, isDispatched && styles.dispatchButtonDone]}
                 testID={`dispatch-refill-${item.id}`}
                 onPress={() => handleDispatch(item.id)}
                 disabled={isDispatched || processingId === item.id}
                 activeOpacity={0.8}
               >
                 {processingId === item.id ? (
                   <ActivityIndicator color="#FFFFFF" />
                 ) : isDispatched ? (
                   <>
                     <Ionicons name="checkmark-done" size={18} color="#2D6A4F" />
                     <Text style={styles.dispatchDoneText}>Refill Packaged & Auto-Dispatched</Text>
                   </>
                 ) : (
                   <>
                     <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                     <Text style={styles.dispatchButtonText}>{t.pharmacist.autoDispatch}</Text>
                   </>
                 )}
               </TouchableOpacity>
             </View>
           );
         })
       )}
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
   pharmacyTop: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 12,
     marginBottom: 14
   },
   pharmacyIconBox: {
     width: 44,
     height: 44,
     borderRadius: 12,
     backgroundColor: '#385A49',
     justifyContent: 'center',
     alignItems: 'center'
   },
   pharmacyName: {
     fontSize: 17,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   licenseText: {
     fontSize: 11,
     color: '#636366',
     marginTop: 2
   },
   analyticsGrid: {
     flexDirection: 'row',
     gap: 8,
     backgroundColor: '#F9F8F6',
     borderRadius: 12,
     padding: 10
   },
   metricCard: {
     flex: 1,
     alignItems: 'center',
     justifyContent: 'center'
   },
   metricNumber: {
     fontSize: 18,
     fontWeight: '800',
     color: '#2D6A4F'
   },
   metricLabel: {
     fontSize: 10,
     fontWeight: '600',
     color: '#48484A',
     marginTop: 2,
     textAlign: 'center'
   },
   queueHeader: {
     marginTop: 4
   },
   queueTitle: {
     fontSize: 17,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   queueSub: {
     fontSize: 12,
     color: '#636366',
     marginTop: 2
   },
   refillCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 16,
     padding: 14,
     borderWidth: 1,
     borderColor: '#E2DFD8',
     gap: 10
   },
   refillCardUrgent: {
     borderColor: '#F8CACA',
     backgroundColor: '#FFFDFD'
   },
   cardTop: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'flex-start'
   },
   patientName: {
     fontSize: 15,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   patientPhone: {
     fontSize: 12,
     color: '#636366',
     marginTop: 1
   },
   urgencyBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingVertical: 4,
     paddingHorizontal: 8,
     borderRadius: 6,
     gap: 4
   },
   urgencyHigh: {
     backgroundColor: '#FDE8E8'
   },
   urgencyNormal: {
     backgroundColor: '#E8ECE9'
   },
   urgencyText: {
     fontSize: 11,
     fontWeight: '700'
   },
   drugInfoRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     backgroundColor: '#F9F8F6',
     padding: 8,
     borderRadius: 8
   },
   drugNameText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   stockRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center'
   },
   stockBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 4
   },
   stockBadgeText: {
     fontSize: 11,
     color: '#2D6A4F',
     fontWeight: '600'
   },
   refillDueDate: {
     fontSize: 11,
     color: '#636366'
   },
   dispatchButton: {
     minHeight: 48,
     backgroundColor: '#385A49',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8,
     marginTop: 4
   },
   dispatchButtonDone: {
     backgroundColor: '#E6F4EA',
     borderWidth: 1,
     borderColor: '#CDE5D8'
   },
   dispatchButtonText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   dispatchDoneText: {
     fontSize: 13,
     fontWeight: '700',
     color: '#2D6A4F'
   },
   emptyCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 16,
     padding: 24,
     alignItems: 'center',
     gap: 8
   },
   emptyTitle: {
     fontSize: 14,
     fontWeight: '600',
     color: '#2D6A4F'
   }
 });