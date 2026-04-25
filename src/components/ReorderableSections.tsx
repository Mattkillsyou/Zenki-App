import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  View,
  LayoutChangeEvent,
  Platform} from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Ionicons } from '@expo/vector-icons';

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
}

export function ReorderableSections({ items, editMode, onReorder, onToggleVisibility }: Props) {
  const heights = useRef<Record<string, number>>({}).current;
  const offsets = useRef<Record<string, Animated.Value>>({}).current;

  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const orderRef = useRef(order);
  useEffect(() => { orderRef.current = order; }, [order]);

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

  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (editMode) {
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
  }, [editMode, wiggle]);

  const handleLayout = (id: string) => (e: LayoutChangeEvent) => {
    heights[id] = e.nativeEvent.layout.height;
  };

  const panResponders = useMemo(() => {
    const map: Record<string, ReturnType<typeof PanResponder.create>> = {};
    for (const it of items) {
      const id = it.id;
      let offsetAdjust = 0;

      map[id] = PanResponder.create({
        onStartShouldSetPanResponder: () => editMode,
        onMoveShouldSetPanResponder: (_, g) => editMode && Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          offsetAdjust = 0;
          setDraggingId(id);
          offsets[id].setValue(0);
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
              const prevH = heights[prevId] || 0;
              if (-translateY > prevH / 2 + spacingBetween) {
                const next = [...cur];
                [next[myIdx], next[myIdx - 1]] = [next[myIdx - 1], next[myIdx]];
                offsetAdjust += prevH + spacingBetween;
                orderRef.current = next;
                setOrder(next);
                continue;
              }
            } else if (translateY > 0 && myIdx < cur.length - 1) {
              const nextId = cur[myIdx + 1];
              const nextH = heights[nextId] || 0;
              if (translateY > nextH / 2 + spacingBetween) {
                const next = [...cur];
                [next[myIdx], next[myIdx + 1]] = [next[myIdx + 1], next[myIdx]];
                offsetAdjust -= nextH + spacingBetween;
                orderRef.current = next;
                setOrder(next);
                continue;
              }
            }
            break;
          }
          offsets[id].setValue(g.dy + offsetAdjust);
        },
        onPanResponderRelease: () => {
          Animated.spring(offsets[id], {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 60,
          }).start();
          setDraggingId(null);
          onReorder(orderRef.current);
        },
        onPanResponderTerminate: () => {
          Animated.spring(offsets[id], { toValue: 0, useNativeDriver: true }).start();
          setDraggingId(null);
        },
      });
    }
    return map;
  }, [editMode, items.map((i) => i.id).join('|')]);

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
            ...(editMode && !isDragging ? [{ rotate }] : []),
          ],
          zIndex: isDragging ? 100 : 1,
          opacity: isDragging ? 0.9 : (isHidden ? 0.35 : 1),
          ...(Platform.OS === 'web' ? { cursor: editMode ? 'grab' : 'default' } : {}),
        };
        return (
          <Animated.View
            key={id}
            onLayout={handleLayout(id)}
            {...(editMode ? panResponders[id].panHandlers : {})}
            style={dragStyle as any}
          >
            {item.node}
            {editMode && onToggleVisibility && (
              <SoundPressable
                onPress={() => onToggleVisibility(id)}
                activeOpacity={0.7}
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
