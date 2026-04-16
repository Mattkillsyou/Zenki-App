import { ImageSourcePropType } from 'react-native';

export type ProductCategory = 'All' | 'Apparel' | 'Gear' | 'Accessories';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  memberPrice: number;
  image: ImageSourcePropType;
  badge: string | null;
  description: string;
  sizes?: string[];
  inStock: boolean;
}

export const CATEGORIES: ProductCategory[] = ['All', 'Apparel', 'Gear', 'Accessories'];

// ──────────────────────────────────────────────────────────
// EDIT PRODUCTS HERE — Just copy a block, change the fields.
// To add a new product:
//   1. Drop the image in assets/products/
//   2. Copy any product block below
//   3. Change id, name, prices, description, image require()
//   4. Set sizes if applicable, inStock true/false
// ──────────────────────────────────────────────────────────

export const PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'ZENKimono [Gi RESPECT edition]',
    category: 'Apparel',
    price: 200.00,
    memberPrice: 170.00,
    image: require('../../assets/products/gi-respect-edition.jpg'),
    badge: 'Best Seller',
    description: 'Premium competition-grade Gi with the Zenki Dojo RESPECT edition branding. Pearl weave construction, reinforced stitching throughout. IBJJF approved.',
    sizes: ['A1', 'A2', 'A3', 'A4'],
    inStock: true,
  },
  {
    id: '2',
    name: 'In Zenki We Trust Hoodie',
    category: 'Apparel',
    price: 100.00,
    memberPrice: 85.00,
    image: require('../../assets/products/hoodie-trust.jpg'),
    badge: null,
    description: 'Heavyweight fleece hoodie with embroidered "In Zenki We Trust" crest. 80% cotton, 20% polyester. Kangaroo pocket, ribbed cuffs.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    inStock: true,
  },
  {
    id: '3',
    name: 'Helio Gracie Shirt',
    category: 'Apparel',
    price: 30.00,
    memberPrice: 25.00,
    image: require('../../assets/products/shirt-helio-gracie.jpg'),
    badge: null,
    description: 'Soft-wash cotton tee featuring the legendary Helio Gracie tribute design. Relaxed fit, pre-shrunk.',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
  },
  {
    id: '4',
    name: 'Musashi Samurai Shirt',
    category: 'Apparel',
    price: 30.00,
    memberPrice: 25.00,
    image: require('../../assets/products/shirt-musashi-samurai.jpg'),
    badge: null,
    description: 'Premium cotton tee with Miyamoto Musashi samurai artwork. Ring-spun cotton, tagless comfort.',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
  },
  {
    id: '5',
    name: 'Yoga Pants',
    category: 'Apparel',
    price: 55.00,
    memberPrice: 47.00,
    image: require('../../assets/products/yoga-pants.jpg'),
    badge: 'New',
    description: 'High-performance yoga pants with four-way stretch fabric. Moisture-wicking, flatlock seams, hidden waistband pocket.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    inStock: true,
  },
  {
    id: '6',
    name: '"Make Jiu Jitsu Helio Gracie Again" Hat',
    category: 'Accessories',
    price: 29.99,
    memberPrice: 24.99,
    image: require('../../assets/products/hat-helio-gracie.jpg'),
    badge: null,
    description: 'Structured snapback with embroidered front design. Adjustable snap closure, curved brim.',
    inStock: true,
  },
  {
    id: '7',
    name: 'ZenKiZEEYS',
    category: 'Accessories',
    price: 40.00,
    memberPrice: 34.00,
    image: require('../../assets/products/zenkizeeys.jpg'),
    badge: null,
    description: 'Zenki Dojo signature accessories. Limited edition collectible.',
    inStock: true,
  },
  {
    id: '8',
    name: 'Zenki Samurai Handwraps',
    category: 'Gear',
    price: 20.00,
    memberPrice: 17.00,
    image: require('../../assets/products/handwraps-samurai.jpg'),
    badge: 'Member Price',
    description: 'Semi-elastic 180" handwraps with samurai print. Hook-and-loop closure, thumb loop. Sold as a pair.',
    inStock: true,
  },
  {
    id: '9',
    name: 'Zenki Water Holder',
    category: 'Accessories',
    price: 20.00,
    memberPrice: 17.00,
    image: require('../../assets/products/water-holder.jpg'),
    badge: null,
    description: 'Insulated water bottle holder with Zenki branding. Adjustable strap, fits most bottles up to 32oz.',
    inStock: true,
  },
];
