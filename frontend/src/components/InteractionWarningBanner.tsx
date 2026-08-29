 import React from 'react';
 import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { DrugInteraction } from '../types';
 
 interface InteractionWarningBannerProps {
   interactions: DrugInteraction[];
   onPressDetails?: () => void;
 }
 
 export const InteractionWarningBanner = ({ interactions, onPressDetails }: InteractionWarningBannerProps) => {
   if (!interactions || interactions.length === 0) return null;
 
   const severeCount = interactions.filter(i => i.severity === 'Severe').length;
   const isSevere = severeCount > 0;
 
   return (
     <View style={[styles.container, isSevere ? styles.containerSevere : styles.containerModerate]}>
       <View style={styles.topRow}>
         <View style={[styles.iconCircle, isSevere ? styles.iconCircleSevere : styles.iconCircleModerate]}>
           <Ionicons name={isSevere ? 'warning' : 'information-circle'} size={20} color="#FFFFFF" />
         </View>
         <View style={{ flex: 1 }}>
           <Text style={[styles.title, isSevere ? styles.titleSevere : styles.titleModerate]}>
             {isSevere ? `Safety Alert: ${severeCount} Contraindication Flagged` : 'Clinical Interaction Notice'}
           </Text>
           <Text style={styles.subtitle}>Cross-referenced with RxNorm & OpenFDA</Text>
         </View>
       </View>
 
       {interactions.map((item, idx) => (
         <View key={idx} style={styles.interactionItem}>
           <View style={styles.pairRow}>
             <Text style={styles.pairNames}>{item.drug_a} + {item.drug_b}</Text>
             <View style={[styles.severityBadge, item.severity === 'Severe' ? styles.badgeSevere : styles.badgeModerate]}>
               <Text style={styles.severityText}>{item.severity}</Text>
             </View>
           </View>
           <Text style={styles.warningMessage}>{item.warning_message}</Text>
           <Text style={styles.mechanismText}>Mechanism: {item.mechanism}</Text>
         </View>
       ))}
     </View>
   );
 };
 
 const styles = StyleSheet.create({
   container: {
     borderRadius: 16,
     padding: 14,
     marginBottom: 14,
     borderWidth: 1.5
   },
   containerSevere: {
     backgroundColor: '#FFF5F5',
     borderColor: '#BA3C3C'
   },
   containerModerate: {
     backgroundColor: '#FFFDF0',
     borderColor: '#C17900'
   },
   topRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 10,
     marginBottom: 10
   },
   iconCircle: {
     width: 32,
     height: 32,
     borderRadius: 16,
     justifyContent: 'center',
     alignItems: 'center'
   },
   iconCircleSevere: {
     backgroundColor: '#BA3C3C'
   },
   iconCircleModerate: {
     backgroundColor: '#C17900'
   },
   title: {
     fontSize: 14,
     fontWeight: '800'
   },
   titleSevere: {
     color: '#BA3C3C'
   },
   titleModerate: {
     color: '#8A5800'
   },
   subtitle: {
     fontSize: 11,
     color: '#636366',
     marginTop: 1
   },
   interactionItem: {
     backgroundColor: '#FFFFFF',
     borderRadius: 10,
     padding: 10,
     marginTop: 8,
     borderWidth: 1,
     borderColor: '#E2DFD8'
   },
   pairRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 4
   },
   pairNames: {
     fontSize: 13,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   severityBadge: {
     paddingVertical: 2,
     paddingHorizontal: 6,
     borderRadius: 6
   },
   badgeSevere: {
     backgroundColor: '#BA3C3C'
   },
   badgeModerate: {
     backgroundColor: '#C17900'
   },
   severityText: {
     fontSize: 10,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   warningMessage: {
     fontSize: 12,
     color: '#1C1C1E',
     fontWeight: '500',
     marginTop: 2
   },
   mechanismText: {
     fontSize: 11,
     color: '#636366',
     marginTop: 3,
     fontStyle: 'italic'
   }
 });