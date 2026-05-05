import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import { Product } from '../data/products';

const CART_KEY = '@zenki_cart';

export interface CartItem {
  product: Product;
  quantity: number;
  /** Optional size variant (e.g. 'M', 'L'). Two items with the same product
   *  but different sizes are stored as separate entries. */
  selectedSize?: string;
}

interface CartContextValue {
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: Product, quantity?: number, selectedSize?: string) => void;
  removeFromCart: (productId: string, selectedSize?: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue>({
  cart: [],
  cartCount: 0,
  cartTotal: 0,
  addToCart: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
});

const sameLine = (a: CartItem, productId: string, selectedSize?: string) =>
  a.product.id === productId && (a.selectedSize ?? null) === (selectedSize ?? null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from AsyncStorage on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CART_KEY).then((raw) => {
      if (cancelled) return;
      const parsed = safeParseJSON<CartItem[]>(raw, [], Array.isArray);
      if (parsed.length > 0) setCart(parsed);
      setHydrated(true);
    }).catch((err) => {
      console.warn('[Cart] hydrate failed:', err);
      if (!cancelled) setHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Persist on change. Skip until hydration completes so we don't clobber
  // the saved cart with the initial empty array.
  useEffect(() => {
    if (!hydrated) return;
    if (cart.length > 0) {
      safeStorageSet(CART_KEY, cart, '[Cart]');
    } else {
      AsyncStorage.removeItem(CART_KEY).catch((err) => {
        console.warn('[Cart] AsyncStorage.removeItem failed:', err);
      });
    }
  }, [cart, hydrated]);

  const addToCart = useCallback(
    (product: Product, quantity: number = 1, selectedSize?: string) => {
      setCart((prev) => {
        const existing = prev.find((item) => sameLine(item, product.id, selectedSize));
        if (existing) {
          return prev.map((item) =>
            sameLine(item, product.id, selectedSize)
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          );
        }
        return [...prev, { product, quantity, selectedSize }];
      });
    },
    [],
  );

  const removeFromCart = useCallback((productId: string, selectedSize?: string) => {
    setCart((prev) => prev.filter((item) => !sameLine(item, productId, selectedSize)));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.memberPrice * item.quantity, 0),
    [cart],
  );

  return (
    <CartContext.Provider value={{ cart, cartCount, cartTotal, addToCart, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
