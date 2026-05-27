// Supabase client configuration
// Replace with your actual Supabase URL and anon key
const SUPABASE_URL = 'https://wmznfdngucpsmjbxiwzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

let supabase;

function initSupabase() {
  if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// Products
async function getProducts(options = {}) {
  let query = supabase.from('products').select('*, categories(*)').eq('active', true);
  if (options.categoryId) query = query.eq('category_id', options.categoryId);
  if (options.search) query = query.or(`name_en.ilike.%${options.search}%,name_ru.ilike.%${options.search}%,name_kz.ilike.%${options.search}%`);
  if (options.sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (options.sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) console.error('getProducts error:', error);
  return data || [];
}

async function getProduct(id) {
  const { data, error } = await supabase.from('products').select('*, categories(*)').eq('id', id).single();
  if (error) console.error('getProduct error:', error);
  return data;
}

async function getCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name_en');
  if (error) console.error('getCategories error:', error);
  return data || [];
}

// Admin - Products
async function adminGetProducts() {
  const { data, error } = await supabase.from('products').select('*, categories(*)').order('created_at', { ascending: false });
  return data || [];
}

async function adminSaveProduct(product) {
  const fields = ['name_en', 'name_kz', 'name_ru', 'name_de', 'name_fr', 'name_es', 'name_it', 'name_tr', 'name_pt', 'name_nl', 'name_pl', 'name_ar',
    'desc_en', 'desc_kz', 'desc_ru', 'desc_de', 'desc_fr', 'desc_es', 'desc_it', 'desc_tr', 'desc_pt', 'desc_nl', 'desc_pl', 'desc_ar',
    'price', 'stock', 'category_id', 'images', 'active'];
  const row = {};
  fields.forEach(f => { if (product[f] !== undefined) row[f] = product[f]; });
  if (product.id) {
    const { data, error } = await supabase.from('products').update(row).eq('id', product.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from('products').insert(row).select().single();
    if (error) throw error;
    return data;
  }
}

async function adminDeleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// Admin - Orders
async function adminGetOrders() {
  const { data, error } = await supabase.from('orders').select('*, products(*)').order('created_at', { ascending: false });
  return data || [];
}

async function adminUpdateOrderStatus(orderId, status) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  if (error) throw error;
}

// Auth - Admin (legacy, kept for admin.html compatibility)
async function adminLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function adminLogout() {
  await supabase.auth.signOut();
}

async function getAdminSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Auth - User
async function userSignUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
}

async function userSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function userSignOut() {
  await supabase.auth.signOut();
}

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) console.error('getUserProfile error:', error);
  return data;
}

async function updateUserProfile(updates) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single();
  if (error) throw error;
  return data;
}

async function isUserAdmin() {
  const profile = await getUserProfile();
  return profile && profile.is_admin === true;
}

function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// User orders
async function getUserOrders() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('orders')
    .select('*, products(*)')
    .eq('customer_email', user.email)
    .order('created_at', { ascending: false });
  if (error) console.error('getUserOrders error:', error);
  return data || [];
}

// Upload image to Supabase Storage
async function uploadImage(file) {
  const fileName = `${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage.from('product-images').upload(fileName, file);
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
  return publicUrl;
}

// Reviews
async function getReviews(productId) {
  const { data, error } = await supabase.from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('approved', true)
    .order('created_at', { ascending: false });
  if (error) console.error('getReviews error:', error);
  return data || [];
}

async function getApprovedReviews(limit = 10) {
  let query = supabase.from('reviews')
    .select('*, products(name_en, name_kz, name_ru, images)')
    .eq('approved', true)
    .order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) console.error('getApprovedReviews error:', error);
  return data || [];
}

async function submitReview(review) {
  const { data, error } = await supabase.from('reviews').insert(review).select().single();
  if (error) throw error;
  return data;
}

async function uploadReviewImage(file) {
  const fileName = `review_${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage.from('review-images').upload(fileName, file);
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('review-images').getPublicUrl(fileName);
  return publicUrl;
}

// Admin - Reviews
async function adminGetReviews() {
  const { data, error } = await supabase.from('reviews')
    .select('*, products(name_en)')
    .order('created_at', { ascending: false });
  return data || [];
}

async function adminApproveReview(id) {
  const { error } = await supabase.from('reviews').update({ approved: true }).eq('id', id);
  if (error) throw error;
}

async function adminDeleteReview(id) {
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) throw error;
}

async function getProductRating(productId) {
  const { data, error } = await supabase.from('reviews')
    .select('rating')
    .eq('product_id', productId)
    .eq('approved', true);
  if (error || !data.length) return { avg: 0, count: 0 };
  const avg = data.reduce((s, r) => s + r.rating, 0) / data.length;
  return { avg: Math.round(avg * 10) / 10, count: data.length };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}
