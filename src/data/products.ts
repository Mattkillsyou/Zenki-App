import { ImageSourcePropType } from 'react-native';

export type ProductCategory = 'All' | 'Apparel' | 'Gear' | 'Accessories';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  memberPrice: number;
  /** Primary image — used everywhere except product detail slideshow. */
  image: ImageSourcePropType;
  /** Optional gallery — shown as a swipeable slideshow on ProductDetail.
   *  If omitted or only one entry, falls back to single `image`. */
  images?: ImageSourcePropType[];
  badge: string | null;
  description: string;
  sizes?: string[];
  inStock: boolean;
}

/**
 * Returns the full image gallery for a product. Always returns at least one
 * image (the primary) even if the `images` field is empty/undefined.
 */
export function getProductImages(p: Product): ImageSourcePropType[] {
  if (p.images && p.images.length > 0) return p.images;
  return [p.image];
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

// Wix CDN image transform helper — requests a high-res version suitable for mobile detail views.
const wx = (id: string, ext = 'jpg') =>
  ({ uri: `https://static.wixstatic.com/media/${id}/v1/fill/w_1200,h_1500,al_c,q_90/file.${ext}` });

export const PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'ZENKimono [Gi RESPECT edition]',
    category: 'Apparel',
    price: 200.00,
    memberPrice: 170.00,
    image: require('../../assets/products/gi-respect-edition.jpg'),
    images: [
      wx('3c36b1_ebc1d832bfc144589f6a715d4787f168~mv2.jpg'),
      wx('3c36b1_4e2dfda04eb4403facd803d2cc2d4b3f~mv2.jpg'),
    ],
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
    images: [
      wx('3c36b1_e80e3c377ee54788a59e79e7854b3e5f~mv2.jpg'),
      wx('3c36b1_27a49d92746c41648837c673213f94d0~mv2.webp', 'webp'),
    ],
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
    images: [
      wx('3c36b1_c40e9057fc2b4389b8c55c2022af6716~mv2.jpg'),
      wx('3c36b1_584dec86c1394618882e6dedcbd772c2~mv2.jpg'),
    ],
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
    images: [
      wx('3c36b1_e82e9c7aac7e4596bd2dfc72b979660b~mv2.jpg'),
      wx('3c36b1_f0f437e2482b48e7b1c63075cebdebdf~mv2.jpg'),
    ],
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
    images: [
      wx('3c36b1_de336331d9474e04aadf8ebb83405271~mv2.jpg'),
      wx('3c36b1_85b22ac34e874589b317b4aabf85181f~mv2.jpg'),
    ],
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
    images: [
      wx('3c36b1_134bf51064a64b3cb6654c742851ccd6~mv2.jpeg', 'jpeg'),
      wx('3c36b1_a1f9dc692d6b44aaa52ebda118ebed98~mv2.jpg'),
    ],
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
    images: [
      wx('3c36b1_2887ed89d3c24da39d2624f9af6f3048f002.jpg'),
    ],
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
    images: [
      wx('3c36b1_e56fc16f7f1d412995e6483df6e31a3b~mv2.jpg'),
      wx('3c36b1_2e643b4ca26a4fb888c9946b363cc7d4~mv2.jpg'),
    ],
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
    images: [
      wx('3c36b1_26adb2e5359e41279302ff88d5645c4d~mv2.jpg'),
      wx('3c36b1_7ec0cf9e8b1e42ed8b9bfb35043b0a29~mv2.jpg'),
    ],
    badge: null,
    description: 'Insulated water bottle holder with Zenki branding. Adjustable strap, fits most bottles up to 32oz.',
    inStock: true,
  },
];
