 import React, { useState } from 'react';
 import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { DoseItem } from '../types';
 import { useApp } from '../context/AppContext';
 
 if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
   UIManager.setLayoutAnimationEnabledExperimental(true);
 }
 
 interface DailyDoseCardProps {
   dose: DoseItem;
   onOpenEducation: (drugName: string, medicationId: string) => void;
 }
 
 export const DailyDoseCard = ({ dose, onOpenEducation }: DailyDoseCardProps) => {
   const { logDose, t } = useApp();
   const [expandedSideEffects, setExpandedSideEffects] = useState(false);
   const isTaken = dose.status === 'taken';
 
   const toggleExpand = () => {
     LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
     setExpandedSideEffects(!expandedSideEffects);
   };
 
   const getMealRuleBadge = () => {
     const rule = dose.meal_rule || 'after_food';
     if (rule === 'before_food') {
       return { label: t.mealRules.before_food, icon: 'restaurant-outline', bg: '#FFF4E5', text: '#B25E00' };
     }
     if (rule === 'empty_stomach') {
       return { label: t.mealRules.empty_stomach, icon: 'water-outline', bg: '#FDE8E8', text: '#9B1C1C' };
     }
     if (rule === 'with_food') {
       return { label: t.mealRules.with_food, icon: 'cafe-outline', bg: '#E8F5E9', text: '#1E4620' };
     }
     return { label: t.mealRules.after_food, icon: 'restaurant', bg: '#E6F0FA', text: '#1A4F7C' };
   };
 
   const mealBadge = getMealRuleBadge();
 
   return (
     <View style={[styles.card, isTaken && styles.cardTaken]}>
       {/* Header with Slot Time & Status */}
       <View style={styles.topRow}>
         <View style={styles.timeBadge}>
           <Ionicons name="time-outline" size={15} color="#385A49" />
           <Text style={styles.timeText}>{dose.scheduled_time}</Text>
           <Text style={styles.slotText}>({dose.slot.toUpperCase()})</Text>
         </View>
 
         {isTaken ? (
           <View style={styles.takenBadge}>
             <Ionicons name="checkmark-circle" size={16} color="#2D6A4F" />
             <Text style={styles.takenBadgeText}>{t.doseActions.taken}</Text>
           </View>
         ) : (
           <View style={styles.pendingBadge}>
             <Ionicons name="ellipse" size={8} color="#C17900" />
             <Text style={styles.pendingBadgeText}>{t.todayHeader.pending}</Text>
           </View>
         )}
       </View>
 
       {/* Drug Info & Dosage */}
       <View style={styles.contentRow}>
         <View style={styles.pillIconBox}>
           <Ionicons name="medical" size={24} color={isTaken ? '#2D6A4F' : '#385A49'} />
         </View>
         <View style={{ flex: 1 }}>
           <Text style={styles.drugName}>{dose.drug_name}</Text>
           <Text style={styles.dosageText}>
             {dose.dosage} • {dose.form || 'Tablet'}
           </Text>
         </View>
       </View>
 
       {/* Meal Rule Clinical Badge */}
       <View style={[styles.mealRuleBox, { backgroundColor: mealBadge.bg }]}>
         <Ionicons name={mealBadge.icon as any} size={15} color={mealBadge.text} />
         <Text style={[styles.mealRuleText, { color: mealBadge.text }]}>
           {dose.meal_rule_label || mealBadge.label}
         </Text>
       </View>
 
       {/* Tier 1 Mild Side Effect Accordion */}
       {dose.tier1_side_effects && dose.tier1_side_effects.length > 0 && (
         <View style={styles.sideEffectsWrapper}>
           <TouchableOpacity style={styles.sideEffectToggle} onPress={toggleExpand} activeOpacity={0.7}>
             <View style={styles.sideEffectHeaderLeft}>
               <Ionicons name="information-circle-outline" size={16} color="#48484A" />
               <Text style={styles.sideEffectToggleText}>{t.doseActions.mildSideEffects}</Text>
             </View>
             <Ionicons
               name={expandedSideEffects ? 'chevron-up' : 'chevron-down'}
               size={16}
               color="#48484A"
             />
           </TouchableOpacity>
 
           {expandedSideEffects && (
             <View style={styles.sideEffectsList}>
               {dose.tier1_side_effects.map((se, idx) => (
                 <View key={idx} style={styles.sideEffectItem}>
                   <Ionicons name="checkmark-circle-outline" size={14} color="#385A49" />
                   <View style={{ flex: 1 }}>
                     <Text style={styles.seSymptom}>{se.symptom}</Text>
                     <Text style={styles.seNote}>{se.note}</Text>
                   </View>
                 </View>
               ))}
             </View>
           )}
         </View>
       )}
 
       {/* Action Buttons (Min 48px touch targets for accessibility) */}
       <View style={styles.actionsRow}>
         <TouchableOpacity
           style={styles.infoButton}
           testID={`dose-info-${dose.medication_id}`}
           onPress={() => onOpenEducation(dose.drug_name, dose.medication_id)}
           activeOpacity={0.7}
           accessibilityLabel="Open deep AI drug education"
         >
           <Ionicons name="bulb-outline" size={16} color="#385A49" />
           <Text style={styles.infoButtonText}>{t.doseActions.viewInfo}</Text>
         </TouchableOpacity>
 
         {!isTaken ? (
           <TouchableOpacity
             style={styles.primaryActionButton}
             testID={`take-dose-${dose.medication_id}`}
             onPress={() => logDose(dose.medication_id, dose.scheduled_time, 'taken')}
             activeOpacity={0.8}
             accessibilityLabel="Mark dose as taken"
           >
             <Ionicons name="checkmark" size={18} color="#FFFFFF" />
             <Text style={styles.primaryActionText}>{t.doseActions.takeDose}</Text>
           </TouchableOpacity>
         ) : (
           <TouchableOpacity
             style={styles.takenCompletedButton}
             onPress={() => logDose(dose.medication_id, dose.scheduled_time, 'pending')}
             activeOpacity={0.8}
             accessibilityLabel="Dose recorded, tap to undo"
           >
             <Ionicons name="checkmark-done" size={18} color="#2D6A4F" />
             <Text style={styles.takenCompletedText}>{t.doseActions.taken} ✓</Text>
           </TouchableOpacity>
         )}
       </View>
     </View>
   );
 };
 
 const styles = StyleSheet.create({
   card: {
     backgroundColor: '#FFFFFF',
     borderRadius: 18,
     padding: 16,
     marginBottom: 14,
     borderWidth: 1,
     borderColor: '#E2DFD8',
     shadowColor: '#000',
     shadowOffset: { width: 0, height: 2 },
     shadowOpacity: 0.04,
     shadowRadius: 6,
     elevation: 2
   },
   cardTaken: {
     backgroundColor: '#FAFDF9',
     borderColor: '#CDE5D8'
   },
   topRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 12
   },
   timeBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#E8ECE9',
     paddingVertical: 5,
     paddingHorizontal: 9,
     borderRadius: 8,
     gap: 5
   },
   timeText: {
     fontSize: 13,
     fontWeight: '700',
     color: '#233A30'
   },
   slotText: {
     fontSize: 11,
     fontWeight: '600',
     color: '#385A49'
   },
   takenBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#E6F4EA',
     paddingVertical: 4,
     paddingHorizontal: 8,
     borderRadius: 6,
     gap: 4
   },
   takenBadgeText: {
     fontSize: 12,
     fontWeight: '700',
     color: '#2D6A4F'
   },
   pendingBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#FFF8E6',
     paddingVertical: 4,
     paddingHorizontal: 8,
     borderRadius: 6,
     gap: 5
   },
   pendingBadgeText: {
     fontSize: 12,
     fontWeight: '600',
     color: '#C17900'
   },
   contentRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 12,
     marginBottom: 12
   },
   pillIconBox: {
     width: 44,
     height: 44,
     borderRadius: 12,
     backgroundColor: '#E8ECE9',
     justifyContent: 'center',
     alignItems: 'center'
   },
   drugName: {
     fontSize: 17,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   dosageText: {
     fontSize: 13,
     color: '#48484A',
     marginTop: 2
   },
   mealRuleBox: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingVertical: 7,
     paddingHorizontal: 10,
     borderRadius: 8,
     gap: 7,
     marginBottom: 10
   },
   mealRuleText: {
     fontSize: 12,
     fontWeight: '600',
     flex: 1
   },
   sideEffectsWrapper: {
     backgroundColor: '#F9F8F6',
     borderRadius: 10,
     paddingHorizontal: 10,
     paddingVertical: 8,
     marginBottom: 12
   },
   sideEffectToggle: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     minHeight: 28
   },
   sideEffectHeaderLeft: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 6
   },
   sideEffectToggleText: {
     fontSize: 12,
     fontWeight: '600',
     color: '#48484A'
   },
   sideEffectsList: {
     marginTop: 8,
     paddingTop: 8,
     borderTopWidth: 1,
     borderTopColor: '#E2DFD8',
     gap: 6
   },
   sideEffectItem: {
     flexDirection: 'row',
     alignItems: 'flex-start',
     gap: 6
   },
   seSymptom: {
     fontSize: 12,
     fontWeight: '600',
     color: '#1C1C1E'
   },
   seNote: {
     fontSize: 11,
     color: '#636366',
     marginTop: 1
   },
   actionsRow: {
     flexDirection: 'row',
     gap: 10,
     marginTop: 4
   },
   infoButton: {
     flex: 1,
     minHeight: 48,
     backgroundColor: '#E8ECE9',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 6
   },
   infoButtonText: {
     fontSize: 13,
     fontWeight: '600',
     color: '#385A49'
   },
   primaryActionButton: {
     flex: 1.3,
     minHeight: 48,
     backgroundColor: '#385A49',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 6
   },
   primaryActionText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   takenCompletedButton: {
     flex: 1.3,
     minHeight: 48,
     backgroundColor: '#E6F4EA',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 6,
     borderWidth: 1,
     borderColor: '#B0DFBF'
   },
   takenCompletedText: {
     fontSize: 13,
     fontWeight: '700',
     color: '#2D6A4F'
   }
 });