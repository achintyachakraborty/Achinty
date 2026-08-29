 import React, { useEffect, useState } from 'react';
 import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 
 const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
 
 export const ClinicDoctorDashboard = () => {
   const { t } = useApp();
   const [patientsData, setPatientsData] = useState<any>(null);
   const [ddiData, setDdiData] = useState<any>(null);
   const [trendsData, setTrendsData] = useState<any>(null);
   const [loading, setLoading] = useState(false);
 
   useEffect(() => {
     fetchClinicData();
   }, []);
 
   const fetchClinicData = async () => {
     try {
       setLoading(true);
       const [pRes, ddiRes, tRes] = await Promise.all([
         fetch(`${BACKEND_URL}/api/clinic/patient-compliance`),
         fetch(`${BACKEND_URL}/api/clinic/flagged-interactions`),
         fetch(`${BACKEND_URL}/api/clinic/missed-dose-trends`)
       ]);
 
       if (pRes.ok) setPatientsData(await pRes.json());
       if (ddiRes.ok) setDdiData(await ddiRes.json());
       if (tRes.ok) setTrendsData(await tRes.json());
     } catch (err) {
       console.log('Error fetching clinic data:', err);
     } finally {
       setLoading(false);
     }
   };
 
   return (
     <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
       {/* Header Card */}
       <View style={styles.headerCard}>
         <View style={styles.clinicTop}>
           <View style={styles.doctorBadge}>
             <Ionicons name="medical" size={24} color="#FFFFFF" />
           </View>
           <View style={{ flex: 1 }}>
             <Text style={styles.doctorName}>Dr. S. Mukherjee, MD</Text>
             <Text style={styles.clinicName}>Apollo Multi-Specialty Heart Center</Text>
           </View>
         </View>
 
         {/* Stats Row */}
         <View style={styles.statsRow}>
           <View style={styles.statBox}>
             <Text style={styles.statValue}>{patientsData?.total_monitored_patients || 1}</Text>
             <Text style={styles.statLabel}>Active Patients</Text>
           </View>
           <View style={styles.statBox}>
             <Text style={[styles.statValue, { color: '#2D6A4F' }]}>
               {patientsData?.average_clinic_compliance || 91.5}%
             </Text>
             <Text style={styles.statLabel}>Clinic Adherence</Text>
           </View>
           <View style={styles.statBox}>
             <Text style={[styles.statValue, { color: '#BA3C3C' }]}>
               {ddiData?.flagged_interactions?.length || 2}
             </Text>
             <Text style={styles.statLabel}>Flagged DDIs</Text>
           </View>
         </View>
       </View>
 
       {/* Flagged Drug-Drug Interaction Matrix */}
       <View style={styles.sectionCard}>
         <View style={styles.sectionHeader}>
           <Ionicons name="warning-outline" size={18} color="#BA3C3C" />
           <Text style={[styles.sectionTitle, { color: '#BA3C3C' }]}>{t.clinic.flaggedInteractions}</Text>
         </View>
 
         {ddiData?.flagged_interactions?.map((item: any) => (
           <View key={item.id} style={styles.ddiCard}>
             <View style={styles.ddiTop}>
               <Text style={styles.ddiPatient}>{item.patient_name}</Text>
               <View style={[styles.sevBadge, item.severity === 'Severe' ? styles.sevSevere : styles.sevMinor]}>
                 <Text style={styles.sevText}>{item.severity}</Text>
               </View>
             </View>
             <Text style={styles.ddiPair}>{item.drug_pair}</Text>
             <Text style={styles.ddiRec}>{item.recommendation}</Text>
           </View>
         ))}
       </View>
 
       {/* Monitored Patients List */}
       <View style={styles.sectionCard}>
         <View style={styles.sectionHeader}>
           <Ionicons name="people-outline" size={18} color="#385A49" />
           <Text style={styles.sectionTitle}>{t.clinic.patientCompliance}</Text>
         </View>
 
         {patientsData?.patients?.map((pat: any) => (
           <View key={pat.id} style={styles.patientRow}>
             <View style={{ flex: 1 }}>
               <Text style={styles.patientName}>{pat.name}</Text>
               <Text style={styles.patientDetail}>Age: {pat.age || 68} • Active Rx: {pat.active_prescriptions_count || 4}</Text>
             </View>
             <View style={styles.complianceBadge}>
               <Text style={styles.complianceValue}>{pat.compliance_score || 92}%</Text>
               <Text style={styles.complianceTag}>{pat.risk_category || 'Optimal'}</Text>
             </View>
           </View>
         ))}
       </View>
 
       {/* Missed Dose Time Trends */}
       <View style={styles.sectionCard}>
         <View style={styles.sectionHeader}>
           <Ionicons name="analytics-outline" size={18} color="#385A49" />
           <Text style={styles.sectionTitle}>{t.clinic.missedTrends}</Text>
         </View>
 
         <View style={styles.trendsGrid}>
           <View style={styles.trendSlot}>
             <Text style={styles.slotName}>Morning</Text>
             <Text style={styles.slotPct}>95.5%</Text>
             <Text style={styles.slotSub}>2 missed</Text>
           </View>
           <View style={[styles.trendSlot, { borderColor: '#F8CACA', backgroundColor: '#FFF9F9' }]}>
             <Text style={styles.slotName}>Afternoon</Text>
             <Text style={[styles.slotPct, { color: '#C17900' }]}>80.0%</Text>
             <Text style={styles.slotSub}>6 missed (Busy)</Text>
           </View>
           <View style={styles.trendSlot}>
             <Text style={styles.slotName}>Evening</Text>
             <Text style={styles.slotPct}>90.0%</Text>
             <Text style={styles.slotSub}>4 missed</Text>
           </View>
           <View style={styles.trendSlot}>
             <Text style={styles.slotName}>Night</Text>
             <Text style={styles.slotPct}>93.3%</Text>
             <Text style={styles.slotSub}>3 missed</Text>
           </View>
         </View>
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
   clinicTop: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 12,
     marginBottom: 14
   },
   doctorBadge: {
     width: 44,
     height: 44,
     borderRadius: 12,
     backgroundColor: '#385A49',
     justifyContent: 'center',
     alignItems: 'center'
   },
   doctorName: {
     fontSize: 17,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   clinicName: {
     fontSize: 11,
     color: '#636366',
     marginTop: 2
   },
   statsRow: {
     flexDirection: 'row',
     gap: 8,
     backgroundColor: '#F9F8F6',
     borderRadius: 12,
     padding: 10
   },
   statBox: {
     flex: 1,
     alignItems: 'center'
   },
   statValue: {
     fontSize: 18,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   statLabel: {
     fontSize: 10,
     color: '#48484A',
     fontWeight: '600',
     marginTop: 2
   },
   sectionCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 18,
     padding: 16,
     borderWidth: 1,
     borderColor: '#E2DFD8',
     gap: 10
   },
   sectionHeader: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     marginBottom: 4
   },
   sectionTitle: {
     fontSize: 15,
     fontWeight: '800',
     color: '#1C1C1E'
   },
   ddiCard: {
     backgroundColor: '#FFF5F5',
     borderRadius: 12,
     padding: 12,
     borderWidth: 1,
     borderColor: '#F8CACA'
   },
   ddiTop: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center'
   },
   ddiPatient: {
     fontSize: 13,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   sevBadge: {
     paddingVertical: 2,
     paddingHorizontal: 6,
     borderRadius: 4
   },
   sevSevere: {
     backgroundColor: '#BA3C3C'
   },
   sevMinor: {
     backgroundColor: '#385A49'
   },
   sevText: {
     fontSize: 9,
     fontWeight: '800',
     color: '#FFFFFF'
   },
   ddiPair: {
     fontSize: 13,
     fontWeight: '700',
     color: '#BA3C3C',
     marginTop: 4
   },
   ddiRec: {
     fontSize: 11,
     color: '#48484A',
     marginTop: 3,
     lineHeight: 15
   },
   patientRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     paddingVertical: 8,
     borderBottomWidth: 1,
     borderBottomColor: '#EFECE6'
   },
   patientName: {
     fontSize: 14,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   patientDetail: {
     fontSize: 11,
     color: '#636366',
     marginTop: 1
   },
   complianceBadge: {
     alignItems: 'flex-end'
   },
   complianceValue: {
     fontSize: 15,
     fontWeight: '800',
     color: '#2D6A4F'
   },
   complianceTag: {
     fontSize: 9,
     fontWeight: '700',
     color: '#385A49'
   },
   trendsGrid: {
     flexDirection: 'row',
     gap: 8
   },
   trendSlot: {
     flex: 1,
     backgroundColor: '#F9F8F6',
     borderRadius: 10,
     padding: 8,
     alignItems: 'center',
     borderWidth: 1,
     borderColor: '#E2DFD8'
   },
   slotName: {
     fontSize: 10,
     fontWeight: '700',
     color: '#48484A'
   },
   slotPct: {
     fontSize: 14,
     fontWeight: '800',
     color: '#2D6A4F',
     marginVertical: 2
   },
   slotSub: {
     fontSize: 8,
     color: '#636366'
   }
 });