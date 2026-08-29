import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider, useApp } from '../src/context/AppContext';
import { Header } from '../src/components/Header';
import { DailyDoseCard } from '../src/components/DailyDoseCard';
import { HealthCheckinBar } from '../src/components/HealthCheckinBar';
import { DrugEducationModal } from '../src/components/DrugEducationModal';
import { InteractionWarningBanner } from '../src/components/InteractionWarningBanner';
import { PrescriptionScannerModal } from '../src/components/PrescriptionScannerModal';
import { CaregiverDashboard } from '../src/components/CaregiverDashboard';
import { PharmacistPortal } from '../src/components/PharmacistPortal';
import { ClinicDoctorDashboard } from '../src/components/ClinicDoctorDashboard';
import { PasswordlessAuthModal } from '../src/components/PasswordlessAuthModal';
import { GuidedPermissionModal } from '../src/components/GuidedPermissionModal';

type TabType = 'today' | 'scanner' | 'education' | 'safety' | 'caregiver' | 'refills' | 'clinic';

function MainAppScreen() {
  const { role, doses, complianceScore, interactions, isLoading, medications, t } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('today');
  
  // Modals state
  const [scannerVisible, setScannerVisible] = useState(false);
  const [educationTarget, setEducationTarget] = useState<{ drugName: string; id: string } | null>(null);
  const [authVisible, setAuthVisible] = useState(false);
  const [permVisible, setPermVisible] = useState(false);

  const openEducation = (drugName: string, medicationId: string) => {
    setEducationTarget({ drugName, id: medicationId });
  };

  // Adjust default view when role switches
  React.useEffect(() => {
    if (role === 'caregiver') setActiveTab('caregiver');
    else if (role === 'pharmacist') setActiveTab('refills');
    else if (role === 'clinic') setActiveTab('clinic');
    else setActiveTab('today');
  }, [role]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9F8F6" />
      
      {/* Botanical Header */}
      <Header onOpenAuth={() => setAuthVisible(true)} />

      {/* Main Content Area */}
      <View style={styles.contentContainer}>
        {activeTab === 'today' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} showsVerticalScrollIndicator={false}>
            {/* Compliance Banner */}
            <View style={styles.complianceCard}>
              <View style={styles.complianceLeft}>
                <Text style={styles.complianceTitle}>{t.todayHeader.title}</Text>
                <Text style={styles.complianceSub}>{t.todayHeader.subtitle}</Text>
              </View>
              <View style={styles.complianceBadge}>
                <Text style={styles.complianceNum}>{complianceScore}%</Text>
                <Text style={styles.complianceLabel}>{t.todayHeader.compliance}</Text>
              </View>
            </View>

            {/* 1-Click Wellness & 1-Touch SOS Emergency Bar */}
            <HealthCheckinBar />

            {/* Cross-Drug Interaction Banner (if any) */}
            <InteractionWarningBanner interactions={interactions} />

            {/* Scan Rx Action Banner */}
            <TouchableOpacity
              testID="scan-prescription-banner"
              style={styles.scanBanner}
              onPress={() => setScannerVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.scanIconCircle}>
                <Ionicons name="camera" size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scanBannerTitle}>{t.scanner.scanButton}</Text>
                <Text style={styles.scanBannerSub}>Instant OCR handwriting extraction (under 85% safety score)</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#385A49" />
            </TouchableOpacity>

            {/* Timeline Pills List */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Scheduled Doses</Text>
              <Text style={styles.dosesCount}>{doses.filter(d => d.status === 'taken').length} of {doses.length} {t.todayHeader.taken}</Text>
            </View>

            {isLoading ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator size="large" color="#385A49" />
                <Text style={styles.loaderText}>Synchronizing daily medicines...</Text>
              </View>
            ) : doses.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={40} color="#385A49" />
                <Text style={styles.emptyCardTitle}>No medications scheduled</Text>
                <Text style={styles.emptyCardSub}>Tap "Scan Doctor Prescription" above to load your routine.</Text>
              </View>
            ) : (
              doses.map((dose) => (
                <DailyDoseCard
                  key={dose.id || `${dose.medication_id}-${dose.scheduled_time}`}
                  dose={dose}
                  onOpenEducation={openEducation}
                />
              ))
            )}
          </ScrollView>
        )}

        {activeTab === 'scanner' && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <View style={styles.scannerTabCard}>
              <Ionicons name="scan-outline" size={48} color="#385A49" />
              <Text style={styles.scannerTabTitle}>{t.scanner.title}</Text>
              <Text style={styles.scannerTabSub}>{t.scanner.subtitle}</Text>
              
              <TouchableOpacity
                style={styles.openScannerBtn}
                testID="open-scanner-button"
                onPress={() => setScannerVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={18} color="#FFFFFF" />
                <Text style={styles.openScannerBtnText}>Open Vision AI Scanner</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {activeTab === 'education' && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <View style={styles.eduHeader}>
              <Text style={styles.eduHeaderTitle}>{t.drugEducation.title}</Text>
              <Text style={styles.eduHeaderSub}>{t.drugEducation.subtitle}</Text>
            </View>

            {medications.map((m) => (
              <TouchableOpacity
                key={m.id}
                testID={`med-education-card-${m.id}`}
                style={styles.medEduCard}
                onPress={() => openEducation(m.drug_name, m.id)}
                activeOpacity={0.7}
              >
                <View style={styles.medEduTop}>
                  <View style={styles.medEduIcon}>
                    <Ionicons name="medical" size={20} color="#385A49" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medEduName}>{m.drug_name}</Text>
                    <Text style={styles.medEduDosage}>{m.dosage} • {m.meal_rule_label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#48484A" />
                </View>
                <Text style={styles.medEduMechanism} numberOfLines={2}>{m.drug_mechanism || 'View AI Mechanism of action...'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {activeTab === 'safety' && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <View style={styles.eduHeader}>
              <Text style={styles.eduHeaderTitle}>Cross-Drug Interaction Matrix</Text>
              <Text style={styles.eduHeaderSub}>Live clinical contraindications cross-referenced with RxNorm & OpenFDA</Text>
            </View>
            <InteractionWarningBanner interactions={interactions} />
          </ScrollView>
        )}

        {activeTab === 'caregiver' && <CaregiverDashboard />}

        {activeTab === 'refills' && <PharmacistPortal />}

        {activeTab === 'clinic' && <ClinicDoctorDashboard />}
      </View>

      {/* Bottom Navigation Tabs with Min 48px Touch Targets & WCAG AAA Contrast */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          testID="tab-today"
          style={[styles.navTab, activeTab === 'today' && styles.navTabActive]}
          onPress={() => setActiveTab('today')}
          accessibilityLabel="Today Routine"
        >
          <Ionicons name={activeTab === 'today' ? 'today' : 'today-outline'} size={20} color={activeTab === 'today' ? '#385A49' : '#636366'} />
          <Text style={[styles.navTabText, activeTab === 'today' && styles.navTabTextActive]}>{t.nav.today}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-scanner"
          style={[styles.navTab, activeTab === 'scanner' && styles.navTabActive]}
          onPress={() => setScannerVisible(true)}
          accessibilityLabel="Scan Prescription"
        >
          <Ionicons name="camera-outline" size={20} color={activeTab === 'scanner' ? '#385A49' : '#636366'} />
          <Text style={[styles.navTabText, activeTab === 'scanner' && styles.navTabTextActive]}>{t.nav.scanner}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-education"
          style={[styles.navTab, activeTab === 'education' && styles.navTabActive]}
          onPress={() => setActiveTab('education')}
          accessibilityLabel="AI Drug Education"
        >
          <Ionicons name={activeTab === 'education' ? 'bulb' : 'bulb-outline'} size={20} color={activeTab === 'education' ? '#385A49' : '#636366'} />
          <Text style={[styles.navTabText, activeTab === 'education' && styles.navTabTextActive]}>{t.nav.education}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-caregiver"
          style={[styles.navTab, activeTab === 'caregiver' && styles.navTabActive]}
          onPress={() => setActiveTab('caregiver')}
          accessibilityLabel="Caregiver Dashboard"
        >
          <Ionicons name={activeTab === 'caregiver' ? 'heart-half' : 'heart-half-outline'} size={20} color={activeTab === 'caregiver' ? '#385A49' : '#636366'} />
          <Text style={[styles.navTabText, activeTab === 'caregiver' && styles.navTabTextActive]}>{t.nav.caregiver}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-refills"
          style={[styles.navTab, activeTab === 'refills' && styles.navTabActive]}
          onPress={() => setActiveTab('refills')}
          accessibilityLabel="Pharmacist Refills"
        >
          <Ionicons name={activeTab === 'refills' ? 'medkit' : 'medkit-outline'} size={20} color={activeTab === 'refills' ? '#385A49' : '#636366'} />
          <Text style={[styles.navTabText, activeTab === 'refills' && styles.navTabTextActive]}>{t.nav.refills}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-clinic"
          style={[styles.navTab, activeTab === 'clinic' && styles.navTabActive]}
          onPress={() => setActiveTab('clinic')}
          accessibilityLabel="Clinic Doctor Oversight"
        >
          <Ionicons name={activeTab === 'clinic' ? 'business' : 'business-outline'} size={20} color={activeTab === 'clinic' ? '#385A49' : '#636366'} />
          <Text style={[styles.navTabText, activeTab === 'clinic' && styles.navTabTextActive]}>{t.nav.clinic}</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <PrescriptionScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onSuccess={() => setActiveTab('today')}
      />

      {educationTarget && (
        <DrugEducationModal
          visible={!!educationTarget}
          drugName={educationTarget.drugName}
          medicationId={educationTarget.id}
          onClose={() => setEducationTarget(null)}
        />
      )}

      <PasswordlessAuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
      />

      <GuidedPermissionModal
        visible={permVisible}
        onGrant={() => setPermVisible(false)}
        onDismiss={() => setPermVisible(false)}
      />
    </SafeAreaView>
  );
}

export default function Index() {
  return (
    <AppProvider>
      <MainAppScreen />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9F8F6'
  },
  contentContainer: {
    flex: 1
  },
  scrollPadding: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20
  },
  complianceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2DFD8'
  },
  complianceLeft: {
    flex: 1
  },
  complianceTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E'
  },
  complianceSub: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2
  },
  complianceBadge: {
    backgroundColor: '#E8ECE9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  complianceNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2D6A4F'
  },
  complianceLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#385A49',
    textTransform: 'uppercase'
  },
  scanBanner: {
    backgroundColor: '#E8ECE9',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#CDE5D8'
  },
  scanIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#385A49',
    justifyContent: 'center',
    alignItems: 'center'
  },
  scanBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E'
  },
  scanBannerSub: {
    fontSize: 11,
    color: '#48484A',
    marginTop: 2
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E'
  },
  dosesCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366'
  },
  loaderBox: {
    padding: 40,
    alignItems: 'center',
    gap: 10
  },
  loaderText: {
    fontSize: 13,
    color: '#636366'
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2DFD8',
    gap: 8
  },
  emptyCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E'
  },
  emptyCardSub: {
    fontSize: 12,
    color: '#636366',
    textAlign: 'center'
  },
  scannerTabCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2DFD8',
    gap: 12
  },
  scannerTabTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E'
  },
  scannerTabSub: {
    fontSize: 13,
    color: '#636366',
    textAlign: 'center'
  },
  openScannerBtn: {
    minHeight: 48,
    backgroundColor: '#385A49',
    borderRadius: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8
  },
  openScannerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  eduHeader: {
    marginBottom: 14
  },
  eduHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E'
  },
  eduHeaderSub: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2
  },
  medEduCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2DFD8',
    marginBottom: 10
  },
  medEduTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  medEduIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E8ECE9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  medEduName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E'
  },
  medEduDosage: {
    fontSize: 12,
    color: '#48484A',
    marginTop: 1
  },
  medEduMechanism: {
    fontSize: 12,
    color: '#636366',
    lineHeight: 16
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2DFD8',
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
    minHeight: 56
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 48
  },
  navTabActive: {
    opacity: 1
  },
  navTabText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#636366',
    marginTop: 3
  },
  navTabTextActive: {
    color: '#385A49',
    fontWeight: '800'
  }
});