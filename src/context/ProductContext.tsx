import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Product, PRODUCTS as BUILTIN_PRODUCTS, ProductCategory } from '../data/products';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { generateId } from '../utils/generateId';

const STORAGE_KEY = '@zenki_custom_products';

/**
 * Custom product input — admin-added products have string image URLs (not
 * require() sources) since they come from a form.
 */
export interface CustomProductInput {
  id?: string;
  name: string;
  category: ProductCategory;
  price: number;
  memberPrice: number;
  imageUrl: string;              // primary image URL (used for grid)
  gallery?: string[];            // optional additional image URLs for slideshow
  badge: string | null;
  description: string;
  sizes?: string[];
  inStock: boolean;
}

/** Internal storage shape — admin-added products keyed by id. */
interface StoredCustomProduct extends CustomProductInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface ProductContextValue {
  products: Product[];                     // merged list: built-in + custom
  customProducts: StoredCustomProduct[];   // only admin-added
  addProduct:    (input: CustomProductInput) => Promise<Product>;
  updateProduct: (id: string, input: Partial<CustomProductInput>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  isSyncing: boolean;
  cloudSyncEnabled: boolean;               // true if Firestore is configured
}

const ProductContext = createContext<ProductContextValue>({
  products: BUILTIN_PRODUCTS,
  customProducts: [],
  addProduct:    async () => ({} as Product),
  updateProduct: async () => {},
  deleteProduct: async () => {},
  isSyncing: false,
  cloudSyncEnabled: false,
});

/** Convert a StoredCustomProduct into the Product shape the rest of the app expects. */
function toProduct(c: StoredCustomProduct): Product {
  const gallery = c.gallery && c.gallery.length > 0
    ? [{ uri: c.imageUrl }, ...c.gallery.map((u) => ({ uri: u }))]
    : undefined;
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    price: c.price,
    memberPrice: c.memberPrice,
    image: { uri: c.imageUrl } as any,
    images: gallery as any,
    badge: c.badge,
    description: c.description,
    sizes: c.sizes,
    inStock: c.inStock,
  };
}

function randomId(): string {
  return generateId('custom');
}

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [customProducts, setCustomProducts] = useState<StoredCustomProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const cloudSyncEnabled = FIREBASE_CONFIGURED && !!db;

  // ── Initial load: AsyncStorage first (fast), Firestore subscribe second
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setCustomProducts(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  // ── Firestore realtime subscription — runs only if configured
  useEffect(() => {
    if (!cloudSyncEnabled || !db) return;
    setIsSyncing(true);
    const q = collection(db, 'customProducts');
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: StoredCustomProduct[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
        items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        setCustomProducts(items);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        setIsSyncing(false);
      },
      (err) => {
        console.warn('[Products] Firestore subscribe error:', err);
        setIsSyncing(false);
      },
    );
    return () => unsub();
  }, [cloudSyncEnabled]);

  // ── Local save whenever customProducts changes (and we're not mid-cloud-sync)
  useEffect(() => {
    if (loaded && !cloudSyncEnabled) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(customProducts));
    }
  }, [customProducts, loaded, cloudSyncEnabled]);

  const addProduct = useCallback(async (input: CustomProductInput): Promise<Product> => {
    const now = new Date().toISOString();
    const id = input.id || randomId();
    const record: StoredCustomProduct = { ...input, id, createdAt: now, updatedAt: now };

    if (cloudSyncEnabled && db) {
      try {
        await setDoc(doc(db, 'customProducts', id), record);
      } catch (e) {
        console.warn('[Products] addProduct cloud failed, saving local:', e);
        setCustomProducts((prev) => [...prev, record]);
      }
    } else {
      setCustomProducts((prev) => [...prev, record]);
    }
    return toProduct(record);
  }, [cloudSyncEnabled]);

  const updateProduct = useCallback(async (id: string, input: Partial<CustomProductInput>): Promise<void> => {
    const existing = customProducts.find((p) => p.id === id);
    if (!existing) return;
    const now = new Date().toISOString();
    const updated: StoredCustomProduct = { ...existing, ...input, updatedAt: now };

    if (cloudSyncEnabled && db) {
      try {
        await setDoc(doc(db, 'customProducts', id), updated);
      } catch (e) {
        console.warn('[Products] updateProduct cloud failed, saving local:', e);
        setCustomProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
    } else {
      setCustomProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    }
  }, [customProducts, cloudSyncEnabled]);

  const deleteProduct = useCallback(async (id: string): Promise<void> => {
    if (cloudSyncEnabled && db) {
      try {
        await deleteDoc(doc(db, 'customProducts', id));
      } catch (e) {
        console.warn('[Products] deleteProduct cloud failed, removing local:', e);
        setCustomProducts((prev) => prev.filter((p) => p.id !== id));
      }
    } else {
      setCustomProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }, [cloudSyncEnabled]);

  // ── Merged list: built-in + custom (custom appear at the end)
  const products: Product[] = [
    ...BUILTIN_PRODUCTS,
    ...customProducts.map(toProduct),
  ];

  return (
    <ProductContext.Provider
      value={{
        products,
        customProducts,
        addProduct,
        updateProduct,
        deleteProduct,
        isSyncing,
        cloudSyncEnabled,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductContext);
}
