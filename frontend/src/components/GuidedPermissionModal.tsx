 import React from 'react';
 import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { useApp } from '../context/AppContext';
 
 interface GuidedPermissionModalProps {
   visible: boolean;
   onGrant: () => void;
   onDismiss: () => void;
 }
 
 export const GuidedPermissionModal = ({ visible, onGrant, onDismiss }: GuidedPermissionModalProps) => {
   const { t } = useApp();
 
   return (
     <Modal visible={visible} animationType="fade" transparent>
       <View style={styles.overlay}>
         <View style={styles.card}>
           <View style={styles.header}>
             <View style={styles.shieldIcon}>
               <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
             </View>
             <Text style={styles.title}>Clinical Safety Permissions</Text>
             <Text style={styles.subtitle}>
               Rx Sync needs your permission to ensure medications are never missed and emergency alerts reach your family.
             </Text>
           </View>
 
           <View style={styles.itemsList}>
             <View style={styles.permItem}>
               <View style={styles.iconBox}>
                 <Ionicons name="notifications" size={20} color="#385A49" />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={styles.permTitle}>High-Priority Dose Alarms</Text>
                 <Text style={styles.permDesc}>
                   Critical for delivering exact timing reminders and meal alerts (before/after food).
                 </Text>
               </View>
             </View>
 
             <View style={styles.permItem}>
               <View style={styles.iconBox}>
                 <Ionicons name="camera" size={20} color="#385A49" />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={styles.permTitle}>Vision AI Prescription Scanner</Text>
                 <Text style={styles.permDesc}>
                   Allows instant photo capture of doctor handwritten prescriptions for OCR safety analysis.
                 </Text>
               </View>
             </View>
           </View>
 
           <TouchableOpacity style={styles.grantButton} onPress={onGrant} activeOpacity={0.8}>
             <Text style={styles.grantButtonText}>Enable Safety Reminders</Text>
           </TouchableOpacity>
 
           <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
             <Text style={styles.dismissButtonText}>Maybe Later</Text>
           </TouchableOpacity>
         </View>
       </View>
     </Modal>
   );
 };
 
 const styles = StyleSheet.create({
   overlay: {
     flex: 1,
     backgroundColor: 'rgba(0,0,0,0.6)',
     justifyContent: 'center',
     alignItems: 'center',
     padding: 20
   },
   card: {
     width: '100%',
     maxWidth: 380,
     backgroundColor: '#FFFFFF',
     borderRadius: 22,
     padding: 20,
     alignItems: 'center'
   },
   header: {
     alignItems: 'center',
     marginBottom: 16
   },
   shieldIcon: {
     width: 56,
     height: 56,
     borderRadius: 28,
     backgroundColor: '#385A49',
     justifyContent: 'center',
     alignItems: 'center',
     marginBottom: 10
   },
   title: {
     fontSize: 18,
     fontWeight: '800',
     color: '#1C1C1E',
     textAlign: 'center'
   },
   subtitle: {
     fontSize: 12,
     color: '#636366',
     textAlign: 'center',
     marginTop: 4,
     lineHeight: 17
   },
   itemsList: {
     width: '100%',
     gap: 12,
     marginBottom: 18
   },
   permItem: {
     flexDirection: 'row',
     alignItems: 'flex-start',
     backgroundColor: '#F9F8F6',
     padding: 12,
     borderRadius: 12,
     gap: 12
   },
   iconBox: {
     width: 36,
     height: 36,
     borderRadius: 10,
     backgroundColor: '#E8ECE9',
     justifyContent: 'center',
     alignItems: 'center'
   },
   permTitle: {
     fontSize: 13,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   permDesc: {
     fontSize: 11,
     color: '#636366',
     marginTop: 2,
     lineHeight: 15
   },
   grantButton: {
     width: '100%',
     minHeight: 48,
     backgroundColor: '#385A49',
     borderRadius: 12,
     justifyContent: 'center',
     alignItems: 'center'
   },
   grantButtonText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   dismissButton: {
     paddingVertical: 10,
     marginTop: 4
   },
   dismissButtonText: {
     fontSize: 13,
     fontWeight: '600',
     color: '#636366'
   }
 });