import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Modal, Alert, Switch, ActivityIndicator, Platform,
  KeyboardAvoidingView} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useMedicationTracker, DailyMedicationItem, CalendarDay } from '../context/MedicationTrackerContext';
import { spacing } from '../theme';
import { FadeInView } from '../components';
import {
  MedicationEntry, MedicationCategory, FrequencyType, RouteOfAdministration,
  DrugSearchResult, INJECTION_SITES,
  CATEGORY_LABELS, CATEGORY_COLORS,
  ROUTE_LABELS, ROUTE_ICONS,
  FREQUENCY_LABELS,
  formatTimeLabel, nextInjectionSite,
} from '../types/medication';
import { searchMedications, getPopularResults } from '../services/drugSearch';

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────

function todayIso(): string {
  return isoDateOf(new Date());
}
function isoDateOf(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}
function startOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return isoDateOf(d);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDateOf(d);
}
function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}
function dayNumber(iso: string): number {
  return new Date(iso + 'T00:00:00').getDate();
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Tab = 'today' | 'all';

// ─────────────────────────────────────────────────
// Adherence ring
// ─────────────────────────────────────────────────
function AdherenceRing({ rate, size = 38, color }: { rate: number; size?: number; color: string }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = Math.max(0, Math.min(1, rate)) * circumference;
  const pct = Math.round(rate * 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color + '25'} strokeWidth={stroke} fill="none"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 10, fontWeight: '800', color }}>
        {pct}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────

export function MedicationTrackerScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    memberMedications, getMedicationsForDate, getCalendarWeek,
    getAdherence, logDose, removeMedication,
  } = useMedicationTracker();

  const [tab, setTab] = useState<Tab>('today');
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [weekStart, setWeekStart] = useState<string>(startOfWeek(todayIso()));
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicationEntry | null>(null);

  const meds = user ? memberMedications(user.id) : [];
  const calendarDays: CalendarDay[] = user ? getCalendarWeek(user.id, weekStart) : [];
  const dayItems: DailyMedicationItem[] = user ? getMedicationsForDate(user.id, selectedDate) : [];

  const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
  const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));

  const handleEditMed = (m: MedicationEntry) => {
    setEditingMed(m);
    setShowAddModal(true);
  };
  const handleAddNew = () => {
    setEditingMed(null);
    setShowAddModal(true);
  };

  const handleDeleteMed = (m: MedicationEntry) => {
    Alert.alert(
      'Delete medication?',
      `This will remove "${m.name}" and all its scheduled reminders. Logs will also be cleared.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeMedication(m.id);
          },
        },
      ],
    );
  };

  const handleMarkTaken = (item: DailyMedicationItem, time: string) => {
    if (!user) return;
    const med = item.medication;
    const scheduledFor = `${selectedDate}T${time}:00`;
    const isInjectable = med.route === 'subcutaneous' || med.route === 'intramuscular';

    if (isInjectable && (med.injectionSites?.length ?? 0) > 0) {
      // Suggest next site
      const suggested = nextInjectionSite(med.injectionSites!, med.lastInjectionSite) || med.injectionSites![0];
      Alert.alert(
        'Log injection',
        `Use site: ${suggested}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Skip dose',
            onPress: () => {
              logDose(med.id, {
                memberId: user.id,
                scheduledFor,
                skipped: true,
              });
            },
          },
          {
            text: `Log @ ${suggested}`,
            onPress: () => {
              logDose(med.id, {
                memberId: user.id,
                scheduledFor,
                injectionSite: suggested,
              });
            },
          },
        ],
      );
    } else {
      logDose(med.id, {
        memberId: user.id,
        scheduledFor,
      });
    }
  };

  const handleSkip = (item: DailyMedicationItem, time: string) => {
    if (!user) return;
    const scheduledFor = `${selectedDate}T${time}:00`;
    logDose(item.medication.id, {
      memberId: user.id,
      scheduledFor,
      skipped: true,
    });
  };

  const isLoggedFor = (item: DailyMedicationItem, time: string) => {
    return item.logs.find((l) => l.scheduledFor.includes(`T${time}`));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Medications</Text>
        <SoundPressable
          onPress={handleAddNew}
          style={[styles.addBtn, { backgroundColor: colors.gold }]}
        >
          <Ionicons name="add" size={22} color="#000" />
        </SoundPressable>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {([
          { key: 'today' as Tab, label: 'Schedule', icon: 'calendar-outline' as const },
          { key: 'all' as Tab, label: 'All Meds', icon: 'medkit-outline' as const },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <SoundPressable
              key={t.key}
              style={[styles.tab, active && { backgroundColor: colors.gold }]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon} size={16} color={active ? '#000' : colors.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textMuted }]}>{t.label}</Text>
            </SoundPressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'today' && (
          <>
            {/* Calendar strip */}
            <FadeInView>
              <View style={[styles.calCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.calNav}>
                  <SoundPressable onPress={handlePrevWeek} style={styles.calNavBtn}>
                    <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
                  </SoundPressable>
                  <Text style={[styles.calTitle, { color: colors.textPrimary }]}>
                    {weekRangeLabel(weekStart)}
                  </Text>
                  <SoundPressable onPress={handleNextWeek} style={styles.calNavBtn}>
                    <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
                  </SoundPressable>
                </View>
                <View style={styles.weekRow}>
                  {calendarDays.map((d) => {
                    const isSelected = d.date === selectedDate;
                    const isToday = d.date === todayIso();
                    const dotColor =
                      d.totalDoses === 0 ? colors.borderSubtle :
                      d.completionRate >= 1 ? colors.gold :
                      d.completionRate >= 0.5 ? colors.warning :
                      d.completionRate > 0 ? colors.warning :
                      isToday || new Date(d.date) < new Date(todayIso()) ? colors.error :
                      colors.textMuted;
                    return (
                      <SoundPressable
                        key={d.date}
                        style={[
                          styles.dayCol,
                          isSelected && {
                            backgroundColor: colors.gold + '20',
                            borderColor: colors.gold,
                            borderWidth: 1.5,
                          },
                        ]}
                        onPress={() => setSelectedDate(d.date)}
                      >
                        <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
                          {dayLabel(d.date)}
                        </Text>
                        <Text style={[
                          styles.dayNum,
                          { color: isToday ? colors.gold : colors.textPrimary },
                        ]}>
                          {dayNumber(d.date)}
                        </Text>
                        <View style={[styles.dayDot, { backgroundColor: dotColor }]} />
                      </SoundPressable>
                    );
                  })}
                </View>
              </View>
            </FadeInView>

            {/* Daily schedule */}
            <FadeInView delay={80}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                {selectedDateLabel(selectedDate)} · {dayItems.reduce((acc, it) => acc + it.times.length, 0)} doses
              </Text>

              {dayItems.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="medical-outline" size={36} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                    Nothing scheduled
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                    Add a medication or peptide to get started.
                  </Text>
                  <SoundPressable
                    onPress={handleAddNew}
                    style={[styles.emptyBtn, { backgroundColor: colors.gold }]}
                  >
                    <Ionicons name="add" size={16} color="#000" />
                    <Text style={styles.emptyBtnText}>Add Medication</Text>
                  </SoundPressable>
                </View>
              ) : (
                buildScheduleSlots(dayItems).map(({ time, items }) => (
                  <View key={time} style={styles.timeSlot}>
                    <View style={styles.timeSlotHeader}>
                      <View style={[styles.timeBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="time-outline" size={12} color={colors.gold} />
                        <Text style={[styles.timeBadgeText, { color: colors.textPrimary }]}>
                          {formatTimeLabel(time)}
                        </Text>
                      </View>
                    </View>

                    {items.map(({ item, time: t }) => {
                      const med = item.medication;
                      const log = isLoggedFor(item, t);
                      const taken = log && !log.skipped;
                      const skipped = log?.skipped;
                      const catColor = CATEGORY_COLORS[med.category];
                      return (
                        <View
                          key={`${med.id}_${t}`}
                          style={[
                            styles.doseRow,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                            taken && { borderColor: colors.success },
                            skipped && { borderColor: colors.textMuted, opacity: 0.7 },
                          ]}
                        >
                          <View style={[styles.catSwatch, { backgroundColor: catColor }]} />
                          <View style={styles.doseRouteIcon}>
                            <Text style={{ fontSize: 18 }}>{ROUTE_ICONS[med.route]}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.doseName, { color: colors.textPrimary }]} numberOfLines={1}>
                              {med.name}
                            </Text>
                            <Text style={[styles.doseSub, { color: colors.textMuted }]} numberOfLines={1}>
                              {med.dose} {med.doseUnit} · {ROUTE_LABELS[med.route]}
                            </Text>
                            {log?.injectionSite && (
                              <Text style={[styles.doseSite, { color: catColor }]} numberOfLines={1}>
                                {log.injectionSite}
                              </Text>
                            )}
                          </View>
                          <View style={styles.doseActions}>
                            {!log && (
                              <>
                                <SoundPressable
                                  onPress={() => handleSkip(item, t)}
                                  style={[styles.actionBtn, { borderColor: colors.border }]}
                                >
                                  <Ionicons name="close" size={16} color={colors.textMuted} />
                                </SoundPressable>
                                <SoundPressable
                                  onPress={() => handleMarkTaken(item, t)}
                                  style={[styles.actionBtn, { backgroundColor: colors.success, borderColor: colors.success }]}
                                >
                                  <Ionicons name="checkmark" size={16} color="#FFF" />
                                </SoundPressable>
                              </>
                            )}
                            {taken && (
                              <View style={[styles.statusPill, { backgroundColor: colors.successMuted }]}>
                                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                                <Text style={[styles.statusText, { color: colors.success }]}>Taken</Text>
                              </View>
                            )}
                            {skipped && (
                              <View style={[styles.statusPill, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                                <Ionicons name="remove-circle" size={14} color={colors.textMuted} />
                                <Text style={[styles.statusText, { color: colors.textMuted }]}>Skipped</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </FadeInView>
          </>
        )}

        {tab === 'all' && (
          <FadeInView>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              {meds.length} active {meds.length === 1 ? 'medication' : 'medications'}
            </Text>

            {meds.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="medkit-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No medications yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  Search the drug & peptide database to add your first one.
                </Text>
                <SoundPressable
                  onPress={handleAddNew}
                  style={[styles.emptyBtn, { backgroundColor: colors.gold }]}
                >
                  <Ionicons name="add" size={16} color="#000" />
                  <Text style={styles.emptyBtnText}>Add Medication</Text>
                </SoundPressable>
              </View>
            ) : (
              meds.map((med) => {
                const adherence = getAdherence(med.id, 30);
                const catColor = CATEGORY_COLORS[med.category];
                return (
                  <SoundPressable
                    key={med.id}
                    activeOpacity={0.85}
                    onPress={() => handleEditMed(med)}
                    onLongPress={() => handleDeleteMed(med)}
                    style={[styles.medCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={[styles.catSwatch, { backgroundColor: catColor }]} />
                    <View style={styles.medCardLeft}>
                      <Text style={{ fontSize: 24 }}>{ROUTE_ICONS[med.route]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.medCardTitleRow}>
                        <Text style={[styles.medCardName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {med.name}
                        </Text>
                        <View style={[styles.catPill, { backgroundColor: catColor + '20' }]}>
                          <Text style={[styles.catPillText, { color: catColor }]}>
                            {CATEGORY_LABELS[med.category]}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.medCardSub, { color: colors.textSecondary }]}>
                        {med.dose} {med.doseUnit} · {FREQUENCY_LABELS[med.frequency]}
                      </Text>
                      <Text style={[styles.medCardTimes, { color: colors.textMuted }]} numberOfLines={1}>
                        {med.timesOfDay.map(formatTimeLabel).join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.medCardRight}>
                      <AdherenceRing rate={adherence.rate} color={catColor} />
                      <Text style={[styles.medCardAdherenceLabel, { color: colors.textMuted }]}>30d</Text>
                    </View>
                  </SoundPressable>
                );
              })
            )}
          </FadeInView>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Add/edit modal */}
      <AddEditMedicationModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingMed(null);
        }}
        editing={editingMed}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────
// Schedule slot grouping
// Combines all (med, time) pairs into a flat list keyed by time-of-day
// ─────────────────────────────────────────────────

function buildScheduleSlots(items: DailyMedicationItem[]): Array<{
  time: string;
  items: { item: DailyMedicationItem; time: string }[];
}> {
  const byTime = new Map<string, { item: DailyMedicationItem; time: string }[]>();
  for (const it of items) {
    for (const t of it.times) {
      if (!byTime.has(t)) byTime.set(t, []);
      byTime.get(t)!.push({ item: it, time: t });
    }
  }
  return Array.from(byTime.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, items]) => ({ time, items }));
}

function selectedDateLabel(iso: string): string {
  const today = todayIso();
  if (iso === today) return 'TODAY';
  const yesterday = addDays(today, -1);
  if (iso === yesterday) return 'YESTERDAY';
  const tomorrow = addDays(today, 1);
  if (iso === tomorrow) return 'TOMORROW';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}

function weekRangeLabel(startIso: string): string {
  const end = addDays(startIso, 6);
  const s = new Date(startIso + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sm = s.toLocaleDateString(undefined, { month: 'short' });
  const em = e.toLocaleDateString(undefined, { month: 'short' });
  if (sm === em) return `${sm} ${s.getDate()} – ${e.getDate()}`;
  return `${sm} ${s.getDate()} – ${em} ${e.getDate()}`;
}

// ─────────────────────────────────────────────────
// Add/Edit Modal
// ─────────────────────────────────────────────────

interface AddEditModalProps {
  visible: boolean;
  onClose: () => void;
  editing: MedicationEntry | null;
}

function AddEditMedicationModal({ visible, onClose, editing }: AddEditModalProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { addMedication, updateMedication } = useMedicationTracker();

  // Search state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DrugSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<DrugSearchResult | null>(null);
  const debounceRef = useRef<any>(null);

  // Form state
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState('mg');
  const [category, setCategory] = useState<MedicationCategory>('prescription');
  const [route, setRoute] = useState<RouteOfAdministration>('oral');
  const [frequency, setFrequency] = useState<FrequencyType>('daily');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [timesOfDay, setTimesOfDay] = useState<string[]>(['08:00']);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [injectionSites, setInjectionSites] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Hydrate when editing
  useEffect(() => {
    if (visible && editing) {
      setSelected({
        externalId: editing.externalId ?? '',
        name: editing.name,
        brandName: editing.brandName,
        category: editing.category,
        defaultRoute: editing.route,
        defaultDoseUnit: editing.doseUnit,
      });
      setQuery(editing.name);
      setDose(editing.dose);
      setDoseUnit(editing.doseUnit);
      setCategory(editing.category);
      setRoute(editing.route);
      setFrequency(editing.frequency);
      setCustomDays(editing.customDays ?? []);
      setTimesOfDay([...editing.timesOfDay]);
      setStartDate(editing.startDate.slice(0, 10));
      setEndDate(editing.endDate?.slice(0, 10) ?? '');
      setInjectionSites(editing.injectionSites ?? []);
      setNotes(editing.notes ?? '');
      setNotificationsEnabled(editing.notificationsEnabled);
    } else if (visible && !editing) {
      // Reset to defaults
      setQuery('');
      setSelected(null);
      setSearchResults([]);
      setDose('');
      setDoseUnit('mg');
      setCategory('prescription');
      setRoute('oral');
      setFrequency('daily');
      setCustomDays([]);
      setTimesOfDay(['08:00']);
      setStartDate(todayIso());
      setEndDate('');
      setInjectionSites([]);
      setNotes('');
      setNotificationsEnabled(true);
    }
  }, [visible, editing]);

  // Debounced search
  useEffect(() => {
    if (selected && selected.name === query) return; // skip when user has chosen
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      // Show popular when empty
      if (query.trim().length === 0) setSearchResults(getPopularResults());
      else setSearchResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchMedications(query);
        setSearchResults(results);
      } catch (err) {
        console.warn('[MedScreen] search failed:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  const handlePickResult = (r: DrugSearchResult) => {
    setSelected(r);
    setQuery(r.name);
    setCategory(r.category);
    if (r.defaultRoute) setRoute(r.defaultRoute);
    if (r.defaultDoseUnit) setDoseUnit(r.defaultDoseUnit);
  };

  const adjustTime = (idx: number, delta: number) => {
    setTimesOfDay((prev) => {
      const next = [...prev];
      const [h, m] = next[idx].split(':').map(Number);
      const total = (h * 60 + m + delta + 24 * 60) % (24 * 60);
      const nh = Math.floor(total / 60);
      const nm = total % 60;
      next[idx] = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      return next;
    });
  };

  const handleAddTime = () => {
    setTimesOfDay((prev) => {
      // Suggest a default: noon, then evening, etc.
      const defaults = ['08:00', '12:00', '18:00', '22:00'];
      const next = defaults.find((d) => !prev.includes(d)) ?? '12:00';
      return [...prev, next].sort();
    });
  };
  const handleRemoveTime = (idx: number) => {
    setTimesOfDay((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleCustomDay = (day: number) => {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const toggleInjectionSite = (site: string) => {
    setInjectionSites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site],
    );
  };

  const isInjectable = route === 'subcutaneous' || route === 'intramuscular';

  const canSave = (
    !!user &&
    !!selected &&
    selected.name.trim().length > 0 &&
    dose.trim().length > 0 &&
    timesOfDay.length > 0 &&
    (frequency !== 'custom' || customDays.length > 0)
  );

  const handleSave = async () => {
    if (!user || !selected) return;
    if (!canSave) {
      Alert.alert('Missing info', 'Please complete the form before saving.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateMedication(editing.id, {
          name: selected.name,
          brandName: selected.brandName,
          externalId: selected.externalId,
          category,
          dose: dose.trim(),
          doseUnit: doseUnit.trim(),
          route,
          frequency,
          customDays: frequency === 'custom' ? customDays : undefined,
          timesOfDay,
          startDate,
          endDate: endDate || undefined,
          injectionSites: isInjectable ? injectionSites : undefined,
          notes: notes.trim() || undefined,
          notificationsEnabled,
        });
      } else {
        await addMedication({
          memberId: user.id,
          name: selected.name,
          brandName: selected.brandName,
          externalId: selected.externalId,
          category,
          dose: dose.trim(),
          doseUnit: doseUnit.trim(),
          route,
          frequency,
          customDays: frequency === 'custom' ? customDays : undefined,
          timesOfDay,
          startDate,
          endDate: endDate || undefined,
          injectionSites: isInjectable ? injectionSites : undefined,
          notes: notes.trim() || undefined,
          notificationsEnabled,
        });
      }
      onClose();
    } catch (err) {
      console.warn('[MedScreen] save failed:', err);
      Alert.alert('Save failed', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <SoundPressable onPress={onClose} style={[styles.modalCloseBtn, { backgroundColor: colors.surface }]}>
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </SoundPressable>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
            {editing ? 'Edit Medication' : 'Add Medication'}
          </Text>
          <SoundPressable
            onPress={handleSave}
            disabled={!canSave || saving}
            style={[
              styles.modalSaveBtn,
              { backgroundColor: canSave && !saving ? colors.gold : colors.borderSubtle },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={[styles.modalSaveText, { color: canSave ? '#000' : colors.textMuted }]}>
                Save
              </Text>
            )}
          </SoundPressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={64}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* SEARCH */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>SEARCH DRUG / PEPTIDE</Text>
            <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  if (selected && selected.name !== t) setSelected(null);
                }}
                placeholder="e.g. semaglutide, BPC-157, lisinopril…"
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { color: colors.textPrimary }]}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searching && <ActivityIndicator size="small" color={colors.gold} />}
              {!searching && query.length > 0 && (
                <SoundPressable onPress={() => { setQuery(''); setSelected(null); }}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </SoundPressable>
              )}
            </View>

            {/* Results dropdown */}
            {!selected && searchResults.length > 0 && (
              <View style={[styles.resultsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {query.trim().length === 0 && (
                  <Text style={[styles.resultsHeader, { color: colors.textMuted }]}>POPULAR</Text>
                )}
                {searchResults.slice(0, 12).map((r) => (
                  <SoundPressable
                    key={`${r.externalId}_${r.name}`}
                    style={[styles.resultRow, { borderBottomColor: colors.borderSubtle }]}
                    onPress={() => handlePickResult(r)}
                  >
                    <View style={[styles.resultDot, { backgroundColor: CATEGORY_COLORS[r.category] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.brandName && (
                        <Text style={[styles.resultBrand, { color: colors.textMuted }]} numberOfLines={1}>
                          {r.brandName}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.resultCat, { color: CATEGORY_COLORS[r.category] }]}>
                      {CATEGORY_LABELS[r.category]}
                    </Text>
                  </SoundPressable>
                ))}
              </View>
            )}

            {selected && (
              <>
                {/* Selected pill */}
                <View style={[styles.selectedPill, { backgroundColor: CATEGORY_COLORS[category] + '15', borderColor: CATEGORY_COLORS[category] }]}>
                  <Ionicons name="checkmark-circle" size={16} color={CATEGORY_COLORS[category]} />
                  <Text style={[styles.selectedText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {selected.name}
                  </Text>
                  <Text style={[styles.selectedBadge, { color: CATEGORY_COLORS[category] }]}>
                    {CATEGORY_LABELS[category]}
                  </Text>
                </View>

                {/* DOSE */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>DOSE</Text>
                <View style={styles.doseRowInput}>
                  <TextInput
                    value={dose}
                    onChangeText={setDose}
                    placeholder="250"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, flex: 1 }]}
                  />
                  <TextInput
                    value={doseUnit}
                    onChangeText={setDoseUnit}
                    placeholder="mg"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, width: 90 }]}
                  />
                </View>
                <View style={styles.unitChips}>
                  {['mg', 'mcg', 'IU', 'ml', 'g'].map((u) => (
                    <SoundPressable
                      key={u}
                      onPress={() => setDoseUnit(u)}
                      style={[
                        styles.unitChip,
                        { borderColor: colors.border },
                        doseUnit === u && { backgroundColor: colors.gold, borderColor: colors.gold },
                      ]}
                    >
                      <Text style={[styles.unitChipText, { color: doseUnit === u ? '#000' : colors.textPrimary }]}>{u}</Text>
                    </SoundPressable>
                  ))}
                </View>

                {/* CATEGORY */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>CATEGORY</Text>
                <View style={styles.chipRow}>
                  {(Object.keys(CATEGORY_LABELS) as MedicationCategory[]).map((c) => (
                    <SoundPressable
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[
                        styles.chip,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        category === c && { backgroundColor: CATEGORY_COLORS[c], borderColor: CATEGORY_COLORS[c] },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: category === c ? '#FFF' : colors.textPrimary }]}>
                        {CATEGORY_LABELS[c]}
                      </Text>
                    </SoundPressable>
                  ))}
                </View>

                {/* ROUTE */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>ROUTE</Text>
                <View style={styles.chipRow}>
                  {(Object.keys(ROUTE_LABELS) as RouteOfAdministration[]).map((r) => (
                    <SoundPressable
                      key={r}
                      onPress={() => setRoute(r)}
                      style={[
                        styles.chip,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        route === r && { backgroundColor: colors.gold, borderColor: colors.gold },
                      ]}
                    >
                      <Text style={{ marginRight: 4 }}>{ROUTE_ICONS[r]}</Text>
                      <Text style={[styles.chipText, { color: route === r ? '#000' : colors.textPrimary }]}>
                        {ROUTE_LABELS[r]}
                      </Text>
                    </SoundPressable>
                  ))}
                </View>

                {/* FREQUENCY */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>FREQUENCY</Text>
                <View style={styles.chipRow}>
                  {(Object.keys(FREQUENCY_LABELS) as FrequencyType[]).map((f) => (
                    <SoundPressable
                      key={f}
                      onPress={() => {
                        setFrequency(f);
                        if (f === 'twice_daily' && timesOfDay.length < 2) setTimesOfDay(['08:00', '20:00']);
                        if (f === 'three_times_daily' && timesOfDay.length < 3) setTimesOfDay(['08:00', '14:00', '20:00']);
                        if ((f === 'daily' || f === 'weekly' || f === 'biweekly') && timesOfDay.length === 0) setTimesOfDay(['08:00']);
                      }}
                      style={[
                        styles.chip,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        frequency === f && { backgroundColor: colors.gold, borderColor: colors.gold },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: frequency === f ? '#000' : colors.textPrimary }]}>
                        {FREQUENCY_LABELS[f]}
                      </Text>
                    </SoundPressable>
                  ))}
                </View>

                {frequency === 'custom' && (
                  <View style={styles.weekdayRow}>
                    {WEEKDAY_NAMES.map((name, idx) => (
                      <SoundPressable
                        key={name}
                        onPress={() => toggleCustomDay(idx)}
                        style={[
                          styles.weekdayChip,
                          { borderColor: colors.border, backgroundColor: colors.surface },
                          customDays.includes(idx) && { backgroundColor: colors.gold, borderColor: colors.gold },
                        ]}
                      >
                        <Text style={[
                          styles.weekdayText,
                          { color: customDays.includes(idx) ? '#000' : colors.textPrimary },
                        ]}>
                          {name.slice(0, 1)}
                        </Text>
                      </SoundPressable>
                    ))}
                  </View>
                )}

                {/* TIMES OF DAY */}
                <View style={[styles.timesHeader, { marginTop: 16 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>TIMES OF DAY</Text>
                  <SoundPressable onPress={handleAddTime} style={styles.addTimeBtn}>
                    <Ionicons name="add-circle" size={20} color={colors.gold} />
                  </SoundPressable>
                </View>
                {timesOfDay.map((t, idx) => (
                  <View key={`${idx}_${t}`} style={[styles.timeEditRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="time-outline" size={16} color={colors.gold} />
                    <Text style={[styles.timeEditLabel, { color: colors.textPrimary }]}>
                      {formatTimeLabel(t)}
                    </Text>
                    <View style={styles.timeAdjustGroup}>
                      <SoundPressable onPress={() => adjustTime(idx, -60)} style={[styles.timeAdjBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.timeAdjText, { color: colors.textPrimary }]}>-1h</Text>
                      </SoundPressable>
                      <SoundPressable onPress={() => adjustTime(idx, -15)} style={[styles.timeAdjBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.timeAdjText, { color: colors.textPrimary }]}>-15</Text>
                      </SoundPressable>
                      <SoundPressable onPress={() => adjustTime(idx, 15)} style={[styles.timeAdjBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.timeAdjText, { color: colors.textPrimary }]}>+15</Text>
                      </SoundPressable>
                      <SoundPressable onPress={() => adjustTime(idx, 60)} style={[styles.timeAdjBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.timeAdjText, { color: colors.textPrimary }]}>+1h</Text>
                      </SoundPressable>
                    </View>
                    {timesOfDay.length > 1 && (
                      <SoundPressable onPress={() => handleRemoveTime(idx)}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </SoundPressable>
                    )}
                  </View>
                ))}

                {/* DATES */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>START DATE</Text>
                <TextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                />

                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>END DATE (OPTIONAL)</Text>
                <TextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD or leave blank"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                />

                {/* INJECTION SITES (only for SC/IM) */}
                {isInjectable && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>INJECTION SITES (ROTATION)</Text>
                    <View style={styles.chipRow}>
                      {INJECTION_SITES.map((site) => (
                        <SoundPressable
                          key={site}
                          onPress={() => toggleInjectionSite(site)}
                          style={[
                            styles.chip,
                            { borderColor: colors.border, backgroundColor: colors.surface },
                            injectionSites.includes(site) && { backgroundColor: CATEGORY_COLORS[category], borderColor: CATEGORY_COLORS[category] },
                          ]}
                        >
                          <Text style={[styles.chipText, { color: injectionSites.includes(site) ? '#FFF' : colors.textPrimary }]}>
                            {site}
                          </Text>
                        </SoundPressable>
                      ))}
                    </View>
                  </>
                )}

                {/* NOTES */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 16 }]}>NOTES (OPTIONAL)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Anything else worth remembering…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[
                    styles.input,
                    styles.notesInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
                  ]}
                />

                {/* NOTIFICATIONS TOGGLE */}
                <View style={[styles.notifRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, { color: colors.textPrimary }]}>
                      Reminders
                    </Text>
                    <Text style={[styles.notifSub, { color: colors.textMuted }]}>
                      {Platform.OS === 'web'
                        ? 'Push reminders only available on mobile.'
                        : 'Local push notifications at each scheduled time.'}
                    </Text>
                  </View>
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={setNotificationsEnabled}
                    trackColor={{ false: colors.borderSubtle, true: colors.gold }}
                    thumbColor="#FFF"
                    disabled={Platform.OS === 'web'}
                  />
                </View>
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800' },

  tabBar: {
    flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: 14,
    borderWidth: 1, padding: 3, gap: 3, marginBottom: spacing.md,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 11, gap: 4,
  },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  scroll: { paddingHorizontal: spacing.lg },

  // Calendar strip
  calCard: { padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  calNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  calNavBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  calTitle: { fontSize: 14, fontWeight: '800' },
  weekRow: { flexDirection: 'row', gap: 4 },
  dayCol: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8,
    borderRadius: 10,
  },
  dayLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  dayNum: { fontSize: 16, fontWeight: '800' },
  dayDot: { width: 6, height: 6, borderRadius: 3 },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10, marginTop: 4,
  },

  // Time slots
  timeSlot: { marginBottom: 16 },
  timeSlotHeader: { marginBottom: 6 },
  timeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  timeBadgeText: { fontSize: 11, fontWeight: '800' },

  // Dose row (in schedule list)
  doseRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6,
    gap: 8,
  },
  catSwatch: { width: 4, height: 32, borderRadius: 2 },
  doseRouteIcon: { width: 32, alignItems: 'center' },
  doseName: { fontSize: 14, fontWeight: '700' },
  doseSub: { fontSize: 11, marginTop: 1 },
  doseSite: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  doseActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  actionBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: '700' },

  // Empty
  emptyCard: {
    alignItems: 'center', paddingVertical: 32, padding: 20,
    borderRadius: 16, borderWidth: 1, gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 8,
  },
  emptyBtnText: { color: '#000', fontSize: 13, fontWeight: '800' },

  // Med card (all meds tab)
  medCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10,
    gap: 10,
  },
  medCardLeft: { width: 40, alignItems: 'center' },
  medCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  medCardName: { fontSize: 15, fontWeight: '800', flex: 1 },
  medCardSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  medCardTimes: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  medCardRight: { alignItems: 'center', gap: 2 },
  medCardAdherenceLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  catPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  catPillText: { fontSize: 9, fontWeight: '800' },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalSaveBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16,
  },
  modalSaveText: { fontSize: 13, fontWeight: '800' },
  modalScroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },

  // Form
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  input: {
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  doseRowInput: { flexDirection: 'row', gap: 8 },
  unitChips: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  unitChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
  },
  unitChipText: { fontSize: 11, fontWeight: '700' },

  searchInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14 },
  resultsCard: {
    marginTop: 8, borderRadius: 12, borderWidth: 1, overflow: 'hidden',
  },
  resultsHeader: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.2,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultDot: { width: 6, height: 24, borderRadius: 3 },
  resultName: { fontSize: 14, fontWeight: '700' },
  resultBrand: { fontSize: 11, marginTop: 1 },
  resultCat: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  selectedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5, marginTop: 10,
  },
  selectedText: { flex: 1, fontSize: 14, fontWeight: '700' },
  selectedBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },

  weekdayRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  weekdayChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
  },
  weekdayText: { fontSize: 13, fontWeight: '800' },

  // Times editor
  timesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addTimeBtn: { padding: 4 },
  timeEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, marginBottom: 6,
  },
  timeEditLabel: { fontSize: 13, fontWeight: '800', minWidth: 80 },
  timeAdjustGroup: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end' },
  timeAdjBtn: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1,
  },
  timeAdjText: { fontSize: 10, fontWeight: '800' },

  notifRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 16, gap: 12,
  },
  notifTitle: { fontSize: 14, fontWeight: '800' },
  notifSub: { fontSize: 11, marginTop: 2 },
});
