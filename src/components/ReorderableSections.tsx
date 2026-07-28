import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  View,
  LayoutChangeEvent,
  Platform} from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Ionicons } from '@expo/vector-icons';
import { useMotion } from '../context/MotionContext';
import { spring } from '../theme';
import { smallTick } from '../services/senpaiHaptics';

export interface ReorderableItem {
  id: string;
  node: React.ReactNode;
  hidden?: boolean;
}

interface Props {
  items: ReorderableItem[];
  editMode: boolean;
  onReorder: (newIds: string[]) => void;
  onToggleVisibility?: (id: string) => void;
  /** Fires true when a drag starts and false when it ends. The parent
   *  ScrollView must set scrollEnabled={false} while true — otherwise the
   *  native scroll gesture swallows the drag on iOS. */
  onDragActiveChange?: (active: boolean) => void;
}

export function ReorderableSections({ items, editMode, onReorder, onToggleVisibility, onDragActiveChange }: Props) {
  const { reduceMotion } = useMotion();
  const heights = useRef<Record<string, number>>({}).current;
  const offsets = useRef<Record<string, Animated.Value>>({}).current;

  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const orderRef = useRef(order);
  useEffect(() => { orderRef.current = order; }, [order]);

  // Latest-callback ref so the memoized responders never capture a stale prop.
  const dragActiveRef = useRef(onDragActiveChange);
  useEffect(() => { dragActiveRef.current = onDragActiveChange; }, [onDragActiveChange]);
  const onReorderRef = useRef(onReorder);
  useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

  useEffect(() => {
    const incoming = items.map((i) => i.id);
    setOrder((prev) => {
      const sameSet = prev.length === incoming.length && prev.every((id) => incoming.includes(id));
      const next = sameSet
        ? incoming
        : [...prev.filter((id) => incoming.includes(id)), ...incoming.filter((id) => !prev.includes(id))];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [items.map((i) => i.id).join('|')]);

  items.forEach((it) => {
    if (!offsets[it.id]) offsets[it.id] = new Animated.Value(0);
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  useEffect(() => { draggingRef.current = draggingId; }, [draggingId]);

  // If the dragged item vanishes from `items` mid-drag (live sync removed the
  // module), the grip unmounts with the responder active and RN fires neither
  // release nor terminate — without this the parent ScrollView would stay
  // locked and the item's offset would persist if it reappears.
  useEffect(() => {
    if (draggingId && !items.some((i) => i.id === draggingId)) {
      offsets[draggingId]?.setValue(0);
      setDraggingId(null);
      dragActiveRef.current?.(false);
    }
  }, [draggingId, items.map((i) => i.id).join('|')]);

  // Same protection when the whole component unmounts mid-drag.
  useEffect(() => () => {
    if (draggingRef.current) dragActiveRef.current?.(false);
  }, []);

  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Reduce Motion: no jiggle — edit mode stays still.
    if (editMode && !reduceMotion) {
      wiggle.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(wiggle, { toValue: 1, duration: 110, useNativeDriver: true }),
          Animated.timing(wiggle, { toValue: -1, duration: 220, useNativeDriver: true }),
          Animated.timing(wiggle, { toValue: 0, duration: 110, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => { loop.stop(); wiggle.setValue(0); };
    }
  }, [editMode, reduceMotion, wiggle]);

  const handleLayout = (id: string) => (e: LayoutChangeEvent) => {
    heights[id] = e.nativeEvent.layout.height;
  };

  // One responder per item, attached to that item's GRIP HANDLE (not the whole
  // card). Claiming the responder at touch-down — before any movement — is the
  // only reliable way to beat the parent ScrollView's native pan on iOS: by
  // the time a move-based claim fires, the scroll gesture has already begun
  // and the JS responder gets terminated. The grip claims instantly, the
  // parent locks scrolling via onDragActiveChange, and the drag owns every
  // subsequent move.
  const panResponders = useMemo(() => {
    const map: Record<string, ReturnType<typeof PanResponder.create>> = {};
    for (const it of items) {
      const id = it.id;
      let offsetAdjust = 0;

      const endDrag = (settle: boolean) => {
        if (settle && !reduceMotion) {
          Animated.spring(offsets[id], { toValue: 0, useNativeDriver: true, ...spring.settle }).start();
        } else {
          offsets[id].setValue(0);
        }
        setDraggingId(null);
        dragActiveRef.current?.(false);
      };

      map[id] = PanResponder.create({
        onStartShouldSetPanResponder: () => editMode,
        onStartShouldSetPanResponderCapture: () => editMode,
        onMoveShouldSetPanResponder: () => editMode,
        onMoveShouldSetPanResponderCapture: () => editMode,
        // Never hand the gesture back to the ScrollView mid-drag.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          offsetAdjust = 0;
          setDraggingId(id);
          offsets[id].setValue(0);
          dragActiveRef.current?.(true);
          smallTick();
        },
        onPanResponderMove: (_, g) => {
          const spacingBetween = 0;
          let safety = 0;
          while (safety++ < 8) {
            const cur = orderRef.current;
            const myIdx = cur.indexOf(id);
            const translateY = g.dy + offsetAdjust;

            if (translateY < 0 && myIdx > 0) {
              const prevId = cur[myIdx - 1];
              // Unmeasured neighbor (no onLayout yet) → don't swap: a 0
              // height makes the threshold always-true and the order thrashes
              // 8 swaps per move event.
              const prevH = heights[prevId];
              if (!prevH) break;
              if (-translateY > prevH / 2 + spacingBetween) {
                const next = [...cur];
                [next[myIdx], next[myIdx - 1]] = [next[myIdx - 1], next[myIdx]];
                offsetAdjust += prevH + spacingBetween;
                orderRef.current = next;
                setOrder(next);
                smallTick();
                continue;
              }
            } else if (translateY > 0 && myIdx < cur.length - 1) {
              const nextId = cur[myIdx + 1];
              const nextH = heights[nextId];
              if (!nextH) break;
              if (translateY > nextH / 2 + spacingBetween) {
                const next = [...cur];
                [next[myIdx], next[myIdx + 1]] = [next[myIdx + 1], next[myIdx]];
                offsetAdjust -= nextH + spacingBetween;
                orderRef.current = next;
                setOrder(next);
                smallTick();
                continue;
              }
            }
            break;
          }
          offsets[id].setValue(g.dy + offsetAdjust);
        },
        onPanResponderRelease: () => {
          endDrag(true);
          onReorderRef.current(orderRef.current);
        },
        onPanResponderTerminate: () => {
          // OS-level cancel (incoming call, notification shade). The user
          // already saw and felt the swaps, so commit them like a release —
          // leaving them uncommitted desyncs the display from the persisted
          // order until the next mount silently reverts it.
          endDrag(true);
          onReorderRef.current(orderRef.current);
        },
      });
    }
    return map;
  }, [editMode, reduceMotion, items.map((i) => i.id).join('|')]);

  const rotate = wiggle.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-0.6deg', '0.6deg'],
  });

  const itemById = useMemo(() => {
    const m: Record<string, ReorderableItem> = {};
    items.forEach((i) => { m[i.id] = i; });
    return m;
  }, [items]);

  return (
    <View>
      {order.map((id) => {
        const item = itemById[id];
        if (!item) return null;
        const isDragging = draggingId === id;
        const isHidden = !!item.hidden;
        const dragStyle = {
          transform: [
            { translateY: offsets[id] },
            { scale: isDragging ? 1.02 : 1 },
            ...(editMode && !isDragging ? [{ rotate }] : []),
          ],
          zIndex: isDragging ? 100 : 1,
          opacity: isDragging ? 0.92 : (isHidden ? 0.35 : 1),
        };
        return (
          <Animated.View
            key={id}
            onLayout={handleLayout(id)}
            style={dragStyle as any}
          >
            {item.node}
            {editMode && (
              <View
                {...panResponders[id].panHandlers}
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 18,
                  width: 34,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isDragging ? 'rgba(160,160,168,0.95)' : 'rgba(120,120,128,0.92)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 200,
                  // 'grab'/'grabbing' are web-only cursor values missing from RN's types.
                  ...(Platform.OS === 'web' ? { cursor: isDragging ? 'grabbing' : 'grab' } : {}),
                } as any}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                accessibilityLabel="Drag to reorder"
              >
                <Ionicons name="reorder-three" size={20} color="#fff" />
              </View>
            )}
            {editMode && onToggleVisibility && (
              <SoundPressable
                onPress={() => onToggleVisibility(id)}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 18,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isHidden ? 'rgba(60, 200, 120, 0.95)' : 'rgba(220, 70, 70, 0.95)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 200,
                }}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name={isHidden ? 'add' : 'remove'} size={18} color="#fff" />
              </SoundPressable>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}
