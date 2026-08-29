import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';

export const RoleSelectionModal = () => {
  const { needRoleSelection, selectRole, user, t } = useApp();
  const [saving, setSaving] = useState<UserRole | null>(null);

  const roles: { key: UserRole; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string }[] = [
    { key: 'patient', icon: 'person', label: t.roles.patient, sub: 'Track my own daily medicines & health' },
    { key: 'caregiver', icon: 'heart-half', label: t.roles.caregiver, sub: 'Care for a family member remotely' },
    { key: 'pharmacist', icon: 'medkit', label: t.roles.pharmacist, sub: 'Manage prescription refills & dispatch' },
    { key: 'clinic', icon: 'business', label: t.roles.clinic, sub: 'Monitor patient compliance & interactions' }
  ];

  const handleSelect = async (r: UserRole) => {
    setSaving(r);
    await selectRole(r);
    setSaving(null);
  };

  return (
    <Modal visible={needRoleSelection} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet} testID="role-selection-modal">
          <View style={styles.header}>
            <View style={styles.welcomeBadge}>
              <Ionicons name="hand-left" size={22} color="#385A49" />
            </View>
            <Text style={styles.title}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!</Text>
            <Text style={styles.subtitle}>How will you use Rx Sync? Pick your role to personalise your dashboard.</Text>
          </View>

          <View style={styles.list}>
            {roles.map((r) => (
              <TouchableOpacity
                key={r.key}
                testID={`select-role-${r.key}`}
                style={styles.roleCard}
                onPress={() => handleSelect(r.key)}
                disabled={saving !== null}
                activeOpacity={0.8}
              >
                <View style={styles.roleIcon}>
                  <Ionicons name={r.icon} size={20} color="#385A49" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.roleLabel}>{r.label}</Text>
                  <Text style={styles.roleSub}>{r.sub}</Text>
                </View>
                {saving === r.key ? (
                  <ActivityIndicator color="#385A49" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
                )}
              </TouchableOpacity>
            ))}
          </View>
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
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28
  },
  header: {
    marginBottom: 16
  },
  welcomeBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E8ECE9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E'
  },
  subtitle: {
    fontSize: 13,
    color: '#636366',
    marginTop: 4,
    lineHeight: 18
  },
  list: {
    gap: 10
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F8F6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2DFD8',
    padding: 14,
    gap: 12,
    minHeight: 64
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E8ECE9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E'
  },
  roleSub: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2
  }
});
