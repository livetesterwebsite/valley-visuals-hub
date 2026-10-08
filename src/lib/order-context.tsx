import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CartItem = { id: string; productId: string; name: string; image: string; price: number; quantity: number; options: string[] };
export type DemoOrder = { id: string; items: CartItem[]; total: number; type: 'pickup' | 'delivery'; address: string; name: string; time: string };
type State = { selectedStore: string; orderType: 'pickup' | 'delivery'; pickupTime: string; deliveryAddress: string; cartItems: CartItem[]; lastOrder: DemoOrder | null };
const initial: State = { selectedStore: '', orderType: 'pickup', pickupTime: 'ASAP', deliveryAddress: '', cartItems: [], lastOrder: null };
type OrderContextValue = State & { update: (changes: Partial<State>) => void; addItem: (item: CartItem) => void; quantity: (id: string, amount: number) => void; subtotal: number; tax: number; deliveryFee: number; total: number; count: number };
const OrderContext = createContext<OrderContextValue | null>(null);
export function OrderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => { try { const value = localStorage.getItem('vg-demo-order'); if (value) setState({ ...initial, ...JSON.parse(value) }); } catch { /* Start fresh if storage is unavailable. */ } setReady(true); }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem('vg-demo-order', JSON.stringify(state)); } catch { /* The journey remains available without storage. */ } } }, [state, ready]);
  const subtotal = state.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * .095 * 100) / 100;
  const deliveryFee = state.orderType === 'delivery' && subtotal > 0 ? 3.99 : 0;
  const update = (changes: Partial<State>) => setState(prev => ({ ...prev, ...changes }));
  const addItem = (item: CartItem) => setState(prev => ({ ...prev, cartItems: [...prev.cartItems, item] }));
  const quantity = (id: string, amount: number) => setState(prev => ({ ...prev, cartItems: prev.cartItems.map(item => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + amount) } : item).filter(item => item.quantity > 0) }));
  return <OrderContext.Provider value={{ ...state, update, addItem, quantity, subtotal, tax, deliveryFee, total: subtotal + tax + deliveryFee, count: state.cartItems.reduce((sum, item) => sum + item.quantity, 0) }}>{children}</OrderContext.Provider>;
}
export function useOrder() { const value = useContext(OrderContext); if (!value) throw new Error('Order provider is required'); return value; }