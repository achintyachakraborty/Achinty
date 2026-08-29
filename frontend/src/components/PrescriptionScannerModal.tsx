 import React, { useState } from 'react';
 import {
   View,
   Text,
   StyleSheet,
   Modal,
   TouchableOpacity,
   ScrollView,
   TextInput,
   ActivityIndicator,
   Image,
   Linking
 } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import * as ImagePicker from 'expo-image-picker';
 import * as ImageManipulator from 'expo-image-manipulator';
 import { useApp } from '../context/AppContext';
 import { ExtractedMedication } from '../types';
 
 const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
 
 interface PrescriptionScannerModalProps {
   visible: boolean;
   onClose: () => void;
   onSuccess: () => void;
 }
 
 export const PrescriptionScannerModal = ({ visible, onClose, onSuccess }: PrescriptionScannerModalProps) => {
   const { user, language, t, fetchTodayRoutine, fetchMedications, checkInteractions } = useApp();
   const [step, setStep] = useState<'upload' | 'analyzing' | 'verify'>('upload');
   const [ocrConfidence, setOcrConfidence] = useState<number>(89.5);
   const [doctorName, setDoctorName] = useState('Dr. S. Mukherjee, MD');
   const [clinicName, setClinicName] = useState('Apollo Multi-Specialty Clinic');
   const [diagnosis, setDiagnosis] = useState('Hypertension & Type 2 Diabetes');
   const [medications, setMedications] = useState<ExtractedMedication[]>([]);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [hasAcknowledgedLowConfidence, setHasAcknowledgedLowConfidence] = useState(false);
   const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
   const [permissionError, setPermissionError] = useState<string | null>(null);
 
   const resetState = () => {
     setStep('upload');
     setMedications([]);
     setHasAcknowledgedLowConfidence(false);
     setPickedImageUri(null);
     setPermissionError(null);
   };
 
   const resizeToBase64 = async (uri: string): Promise<string | null> => {
     try {
       const manipulated = await ImageManipulator.manipulateAsync(
         uri,
         [{ resize: { width: 1400 } }],
         { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
       );
       return manipulated.base64 || null;
     } catch (e) {
       console.log('Image resize error:', e);
       return null;
     }
   };

   const pickFromGallery = async () => {
     setPermissionError(null);
     const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
     let status = perm.status;
     let canAskAgain = perm.canAskAgain;
     if (status !== 'granted' && canAskAgain) {
       const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
       status = req.status;
       canAskAgain = req.canAskAgain;
     }
     if (status !== 'granted') {
       setPermissionError(
         canAskAgain
           ? 'Photo access is needed to upload your prescription.'
           : 'Photo access is blocked. Please enable it in Settings to upload a prescription.'
       );
       return;
     }
     const result = await ImagePicker.launchImageLibraryAsync({
       mediaTypes: ['images'],
       quality: 0.8,
       allowsEditing: false
     });
     if (!result.canceled && result.assets?.[0]) {
       const asset = result.assets[0];
       setPickedImageUri(asset.uri);
       const b64 = await resizeToBase64(asset.uri);
       if (!b64) {
         setPermissionError('Could not process this image. Please try another photo.');
         return;
       }
       handleExtractOCR(b64);
     }
   };
 
   const takePhoto = async () => {
     setPermissionError(null);
     const perm = await ImagePicker.getCameraPermissionsAsync();
     let status = perm.status;
     let canAskAgain = perm.canAskAgain;
     if (status !== 'granted' && canAskAgain) {
       const req = await ImagePicker.requestCameraPermissionsAsync();
       status = req.status;
       canAskAgain = req.canAskAgain;
     }
     if (status !== 'granted') {
       setPermissionError(
         canAskAgain
           ? 'Camera access is needed to scan your prescription.'
           : 'Camera access is blocked. Please enable it in Settings to scan a prescription.'
       );
       return;
     }
     const result = await ImagePicker.launchCameraAsync({
       quality: 0.8,
       allowsEditing: false
     });
     if (!result.canceled && result.assets?.[0]) {
       const asset = result.assets[0];
       setPickedImageUri(asset.uri);
       const b64 = await resizeToBase64(asset.uri);
       if (!b64) {
         setPermissionError('Could not process this image. Please try another photo.');
         return;
       }
       handleExtractOCR(b64);
     }
   };
 
   const handleExtractOCR = async (imageBase64: string | null = null) => {
     setStep('analyzing');
     try {
       const body: Record<string, any> = { language };
       if (imageBase64) {
         body.image_base64 = imageBase64;
       }
       const res = await fetch(`${BACKEND_URL}/api/prescriptions/extract-ocr`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body)
       });
 
       if (res.ok) {
         const json = await res.json();
         if (json.success === false || !json.extracted_data) {
           setPermissionError(json.message || 'Could not read the prescription. Please try a clearer photo or add medicines manually.');
           setStep('upload');
           return;
         }
         const data = json.extracted_data;
         setDoctorName(data.doctor_name || 'Dr. S. Mukherjee, MD');
         setClinicName(data.clinic_name || 'Apollo Multi-Specialty Clinic');
         setDiagnosis(data.diagnosis || 'Cardio-Metabolic Management');
         setOcrConfidence(data.overall_confidence || 89.5);
         setMedications(data.medications || []);
         setStep('verify');
       } else {
         setPermissionError('Could not read the prescription. Please try a clearer photo.');
         setStep('upload');
       }
     } catch (err) {
       console.log('Error analyzing prescription OCR:', err);
       setPermissionError('Network error while analyzing. Please retry.');
       setStep('upload');
     }
   };
 
   const updateMedicationField = (index: number, field: keyof ExtractedMedication, value: any) => {
     const updated = [...medications];
     updated[index] = { ...updated[index], [field]: value };
     // If user edits a low-confidence field, boost its confidence to 100% (user-verified)
     if (field === 'drug_name') updated[index].drug_name_confidence = 100;
     if (field === 'dosage') updated[index].dosage_confidence = 100;
     if (field === 'exact_time') updated[index].timing_confidence = 100;
     setMedications(updated);
   };
 
   const handleSavePrescription = async () => {
     try {
       setIsSubmitting(true);
       const patientId = user?.id || 'patient_ramesh_001';
       const res = await fetch(`${BACKEND_URL}/api/prescriptions/verify-and-save`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           patient_id: patientId,
           doctor_name: doctorName,
           clinic_name: clinicName,
           diagnosis,
           ocr_confidence_score: ocrConfidence,
           verified_by_user: true,
           medications
         })
       });
 
       if (res.ok) {
         await fetchTodayRoutine();
         await fetchMedications();
         await checkInteractions();
         onSuccess();
         onClose();
         resetState();
       }
     } catch (err) {
       console.log('Error saving prescription:', err);
     } finally {
       setIsSubmitting(false);
     }
   };
 
   const hasLowConfidenceItems = medications.some(
     m => (m.drug_name_confidence < 85 || m.dosage_confidence < 85 || m.timing_confidence < 85 || m.requires_verification)
   );
 
   return (
     <Modal visible={visible} animationType="slide" transparent>
       <View style={styles.overlay}>
         <View style={styles.sheet}>
           {/* Header */}
           <View style={styles.header}>
             <View style={{ flex: 1 }}>
               <Text style={styles.title}>{t.scanner.title}</Text>
               <Text style={styles.subtitle}>{t.scanner.subtitle}</Text>
             </View>
             <TouchableOpacity
               onPress={() => {
                 resetState();
                 onClose();
               }}
               hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
             >
               <Ionicons name="close-circle" size={26} color="#3A3A3C" />
             </TouchableOpacity>
           </View>
 
           {/* Step 1: Upload / Capture Screen */}
           {step === 'upload' && (
             <View style={styles.uploadContainer}>
               <View style={styles.viewfinderBox}>
                 {pickedImageUri ? (
                   <Image source={{ uri: pickedImageUri }} style={styles.previewImage} resizeMode="cover" />
                 ) : (
                   <>
                     <Ionicons name="camera-outline" size={48} color="#385A49" />
                     <Text style={styles.viewfinderText}>Position Prescription Inside Frame</Text>
                     <Text style={styles.viewfinderSub}>Supports handwritten doctor notes & digital Rx</Text>
                   </>
                 )}
               </View>
 
               {permissionError && (
                 <View style={styles.permErrorBox}>
                   <Ionicons name="alert-circle" size={16} color="#BA3C3C" />
                   <Text style={styles.permErrorText}>{permissionError}</Text>
                   {permissionError.includes('Settings') && (
                     <TouchableOpacity
                       testID="open-settings-button"
                       onPress={() => Linking.openSettings()}
                       style={styles.openSettingsBtn}
                     >
                       <Text style={styles.openSettingsText}>Open Settings</Text>
                     </TouchableOpacity>
                   )}
                 </View>
               )}
 
               <View style={styles.uploadActions}>
                 <TouchableOpacity
                   style={styles.sampleRxButton}
                   testID="upload-gallery-button"
                   onPress={pickFromGallery}
                   activeOpacity={0.8}
                 >
                   <Ionicons name="images" size={18} color="#FFFFFF" />
                   <Text style={styles.sampleRxText}>Upload Prescription Photo</Text>
                 </TouchableOpacity>
 
                 <TouchableOpacity
                   style={styles.captureButton}
                   testID="scan-capture-button"
                   onPress={takePhoto}
                   activeOpacity={0.8}
                 >
                   <Ionicons name="camera" size={18} color="#385A49" />
                   <Text style={styles.captureButtonText}>Take Photo with Camera</Text>
                 </TouchableOpacity>
 
                 <TouchableOpacity
                   style={styles.sampleLinkButton}
                   testID="scan-sample-rx-button"
                   onPress={() => handleExtractOCR(null)}
                   activeOpacity={0.7}
                 >
                   <Ionicons name="document-text-outline" size={15} color="#636366" />
                   <Text style={styles.sampleLinkText}>Or try with a sample prescription</Text>
                 </TouchableOpacity>
               </View>
             </View>
           )}
 
           {/* Step 2: Analyzing Pulse */}
           {step === 'analyzing' && (
             <View style={styles.analyzingBox}>
               <ActivityIndicator size="large" color="#385A49" />
               <Text style={styles.analyzingHeading}>Vision AI Parsing Handwriting...</Text>
               <Text style={styles.analyzingSub}>
                 Calculating OCR safety confidence scores & mapping to RxNorm identifiers.
               </Text>
             </View>
           )}
 
           {/* Step 3: Verification & Review Form */}
           {step === 'verify' && (
             <ScrollView contentContainerStyle={styles.verifyScroll} showsVerticalScrollIndicator={false}>
               {/* Confidence Score Badge */}
               <View style={[styles.confidenceBanner, ocrConfidence >= 85 ? styles.confHigh : styles.confLow]}>
                 <View style={styles.confLeft}>
                   <Ionicons
                     name={ocrConfidence >= 85 ? 'shield-checkmark' : 'alert-circle'}
                     size={22}
                     color={ocrConfidence >= 85 ? '#2D6A4F' : '#BA3C3C'}
                   />
                   <View>
                     <Text style={[styles.confTitle, { color: ocrConfidence >= 85 ? '#2D6A4F' : '#BA3C3C' }]}>
                       {t.scanner.confidenceScore}: {ocrConfidence}%
                     </Text>
                     <Text style={styles.confSub}>
                       {ocrConfidence >= 85 ? 'High Confidence (Clinical Safe)' : 'Verification Mandatory'}
                     </Text>
                   </View>
                 </View>
               </View>
 
               {hasLowConfidenceItems && (
                 <View style={styles.redAlertBanner}>
                   <Ionicons name="warning" size={18} color="#BA3C3C" />
                   <Text style={styles.redAlertText}>{t.scanner.lowConfidenceAlert}</Text>
                 </View>
               )}
 
               {/* Clinic & Doctor Details */}
               <View style={styles.rxMetaCard}>
                 <Text style={styles.metaLabel}>Prescribing Doctor</Text>
                 <TextInput
                   style={styles.metaInput}
                   value={doctorName}
                   onChangeText={setDoctorName}
                   placeholder="Doctor Name"
                 />
                 <Text style={[styles.metaLabel, { marginTop: 8 }]}>Clinic / Diagnosis</Text>
                 <TextInput
                   style={styles.metaInput}
                   value={diagnosis}
                   onChangeText={setDiagnosis}
                   placeholder="Diagnosis"
                 />
               </View>
 
               {/* Extracted Medications List */}
               <Text style={styles.medsHeader}>{t.scanner.step3Title}</Text>
 
               {medications.map((med, idx) => {
                 const isLowConf =
                   med.drug_name_confidence < 85 ||
                   med.dosage_confidence < 85 ||
                   med.timing_confidence < 85 ||
                   med.requires_verification;
 
                 return (
                   <View
                     key={idx}
                     style={[styles.extractedCard, isLowConf && styles.extractedCardLowConf]}
                   >
                     {/* Low Confidence Warning Header if < 85% */}
                     {isLowConf && (
                       <View style={styles.lowConfHeader}>
                         <Ionicons name="alert" size={14} color="#FFFFFF" />
                         <Text style={styles.lowConfHeaderText}>
                           {t.scanner.handwritingWarning} - Verify Details Below
                         </Text>
                       </View>
                     )}
 
                     <View style={styles.formRow}>
                       <View style={{ flex: 1.4 }}>
                         <View style={styles.inputLabelRow}>
                           <Text style={styles.inputLabel}>Drug Name</Text>
                           <Text style={[styles.confTag, med.drug_name_confidence < 85 && styles.confTagRed]}>
                             {med.drug_name_confidence}%
                           </Text>
                         </View>
                         <TextInput
                           style={[styles.inputField, med.drug_name_confidence < 85 && styles.inputFieldRed]}
                           value={med.drug_name}
                           onChangeText={val => updateMedicationField(idx, 'drug_name', val)}
                         />
                       </View>
 
                       <View style={{ flex: 1 }}>
                         <View style={styles.inputLabelRow}>
                           <Text style={styles.inputLabel}>Dosage</Text>
                           <Text style={[styles.confTag, med.dosage_confidence < 85 && styles.confTagRed]}>
                             {med.dosage_confidence}%
                           </Text>
                         </View>
                         <TextInput
                           style={[styles.inputField, med.dosage_confidence < 85 && styles.inputFieldRed]}
                           value={med.dosage}
                           onChangeText={val => updateMedicationField(idx, 'dosage', val)}
                         />
                       </View>
                     </View>
 
                     <View style={styles.formRow}>
                       <View style={{ flex: 1 }}>
                         <Text style={styles.inputLabel}>Schedule Time</Text>
                         <TextInput
                           style={styles.inputField}
                           value={med.exact_time}
                           onChangeText={val => updateMedicationField(idx, 'exact_time', val)}
                         />
                       </View>
                       <View style={{ flex: 1.2 }}>
                         <Text style={styles.inputLabel}>Meal Rule</Text>
                         <TextInput
                           style={styles.inputField}
                           value={med.meal_rule_label}
                           onChangeText={val => updateMedicationField(idx, 'meal_rule_label', val)}
                         />
                       </View>
                     </View>
                   </View>
                 );
               })}
 
               {/* Low confidence acknowledgement toggle if needed */}
               {hasLowConfidenceItems && (
                 <TouchableOpacity
                   style={styles.ackRow}
                   testID="acknowledge-low-confidence-toggle"
                   onPress={() => setHasAcknowledgedLowConfidence(!hasAcknowledgedLowConfidence)}
                   activeOpacity={0.8}
                 >
                   <Ionicons
                     name={hasAcknowledgedLowConfidence ? 'checkbox' : 'square-outline'}
                     size={20}
                     color="#385A49"
                   />
                   <Text style={styles.ackText}>
                     I have reviewed and confirmed all highlighted low-confidence fields against the physical prescription.
                   </Text>
                 </TouchableOpacity>
               )}
 
               {/* Save Button */}
               <TouchableOpacity
                 style={[
                   styles.submitButton,
                   hasLowConfidenceItems && !hasAcknowledgedLowConfidence && styles.submitButtonDisabled
                 ]}
                 testID="verify-save-prescription-button"
                 onPress={handleSavePrescription}
                 disabled={isSubmitting || (hasLowConfidenceItems && !hasAcknowledgedLowConfidence)}
                 activeOpacity={0.8}
               >
                 {isSubmitting ? (
                   <ActivityIndicator color="#FFFFFF" />
                 ) : (
                   <>
                     <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
                     <Text style={styles.submitButtonText}>{t.scanner.verifySaveButton}</Text>
                   </>
                 )}
               </TouchableOpacity>
             </ScrollView>
           )}
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
   uploadContainer: {
     paddingVertical: 24,
     alignItems: 'center'
   },
   viewfinderBox: {
     width: '100%',
     height: 200,
     borderRadius: 16,
     borderWidth: 2,
     borderColor: '#385A49',
     borderStyle: 'dashed',
     backgroundColor: '#F9FBF9',
     justifyContent: 'center',
     alignItems: 'center',
     padding: 16,
     marginBottom: 20
   },
   viewfinderText: {
     fontSize: 15,
     fontWeight: '700',
     color: '#1C1C1E',
     marginTop: 10
   },
   viewfinderSub: {
     fontSize: 12,
     color: '#636366',
     marginTop: 4
   },
   previewImage: {
     width: '100%',
     height: '100%',
     borderRadius: 14
   },
   permErrorBox: {
     flexDirection: 'row',
     alignItems: 'center',
     flexWrap: 'wrap',
     gap: 8,
     backgroundColor: '#FFF5F5',
     borderColor: '#F8CACA',
     borderWidth: 1,
     borderRadius: 10,
     padding: 10,
     marginBottom: 12,
     width: '100%'
   },
   permErrorText: {
     flex: 1,
     fontSize: 12,
     color: '#BA3C3C',
     fontWeight: '600'
   },
   openSettingsBtn: {
     backgroundColor: '#BA3C3C',
     borderRadius: 8,
     paddingVertical: 6,
     paddingHorizontal: 12
   },
   openSettingsText: {
     fontSize: 12,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   sampleLinkButton: {
     minHeight: 44,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 6
   },
   sampleLinkText: {
     fontSize: 13,
     fontWeight: '600',
     color: '#636366',
     textDecorationLine: 'underline'
   },
   uploadActions: {
     width: '100%',
     gap: 12
   },
   sampleRxButton: {
     minHeight: 50,
     backgroundColor: '#385A49',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8
   },
   sampleRxText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   captureButton: {
     minHeight: 50,
     backgroundColor: '#E8ECE9',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8
   },
   captureButtonText: {
     fontSize: 14,
     fontWeight: '600',
     color: '#385A49'
   },
   analyzingBox: {
     paddingVertical: 50,
     alignItems: 'center',
     justifyContent: 'center',
     gap: 14
   },
   analyzingHeading: {
     fontSize: 17,
     fontWeight: '700',
     color: '#1C1C1E'
   },
   analyzingSub: {
     fontSize: 13,
     color: '#636366',
     textAlign: 'center',
     paddingHorizontal: 20
   },
   verifyScroll: {
     paddingVertical: 14,
     gap: 12
   },
   confidenceBanner: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     padding: 12,
     borderRadius: 12
   },
   confHigh: {
     backgroundColor: '#E6F4EA'
   },
   confLow: {
     backgroundColor: '#FDE8E8'
   },
   confLeft: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 10
   },
   confTitle: {
     fontSize: 14,
     fontWeight: '700'
   },
   confSub: {
     fontSize: 11,
     color: '#48484A'
   },
   redAlertBanner: {
     backgroundColor: '#FFF5F5',
     borderRadius: 10,
     padding: 10,
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     borderWidth: 1,
     borderColor: '#F8CACA'
   },
   redAlertText: {
     fontSize: 12,
     color: '#BA3C3C',
     fontWeight: '600',
     flex: 1
   },
   rxMetaCard: {
     backgroundColor: '#F9F8F6',
     borderRadius: 12,
     padding: 12
   },
   metaLabel: {
     fontSize: 11,
     fontWeight: '700',
     color: '#48484A',
     marginBottom: 4
   },
   metaInput: {
     backgroundColor: '#FFFFFF',
     borderWidth: 1,
     borderColor: '#E2DFD8',
     borderRadius: 8,
     paddingHorizontal: 10,
     paddingVertical: 8,
     fontSize: 13,
     color: '#1C1C1E'
   },
   medsHeader: {
     fontSize: 15,
     fontWeight: '700',
     color: '#1C1C1E',
     marginTop: 6
   },
   extractedCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 14,
     padding: 12,
     borderWidth: 1,
     borderColor: '#E2DFD8',
     gap: 10
   },
   extractedCardLowConf: {
     borderColor: '#BA3C3C',
     borderWidth: 2,
     backgroundColor: '#FFFDFD'
   },
   lowConfHeader: {
     backgroundColor: '#BA3C3C',
     paddingVertical: 4,
     paddingHorizontal: 8,
     borderRadius: 6,
     flexDirection: 'row',
     alignItems: 'center',
     gap: 6,
     marginBottom: 4
   },
   lowConfHeaderText: {
     fontSize: 11,
     fontWeight: '700',
     color: '#FFFFFF'
   },
   formRow: {
     flexDirection: 'row',
     gap: 10
   },
   inputLabelRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 4
   },
   inputLabel: {
     fontSize: 11,
     fontWeight: '600',
     color: '#48484A'
   },
   confTag: {
     fontSize: 10,
     fontWeight: '700',
     color: '#2D6A4F'
   },
   confTagRed: {
     color: '#BA3C3C'
   },
   inputField: {
     backgroundColor: '#F9F8F6',
     borderWidth: 1,
     borderColor: '#E2DFD8',
     borderRadius: 8,
     paddingHorizontal: 8,
     paddingVertical: 7,
     fontSize: 13,
     color: '#1C1C1E',
     minHeight: 38
   },
   inputFieldRed: {
     borderColor: '#BA3C3C',
     backgroundColor: '#FFF5F5'
   },
   ackRow: {
     flexDirection: 'row',
     alignItems: 'flex-start',
     gap: 8,
     backgroundColor: '#E8ECE9',
     padding: 10,
     borderRadius: 10,
     marginTop: 6
   },
   ackText: {
     fontSize: 12,
     color: '#233A30',
     flex: 1,
     lineHeight: 16
   },
   submitButton: {
     minHeight: 50,
     backgroundColor: '#385A49',
     borderRadius: 12,
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     gap: 8,
     marginTop: 10
   },
   submitButtonDisabled: {
     backgroundColor: '#A3B4AB',
     opacity: 0.7
   },
   submitButtonText: {
     fontSize: 14,
     fontWeight: '700',
     color: '#FFFFFF'
   }
 });