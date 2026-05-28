// Supabase client configuration
const SUPABASE_URL = 'https://wmznfdngucpsmjbxiwzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

let sb = null;

function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return sb;
}

// Fuzzy search helper - Levenshtein distance
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(query, text) {
  if (!text || !query) return false;
  query = query.toLowerCase();
  text = text.toLowerCase();
  // Exact substring match
  if (text.includes(query)) return true;
  // Word-level fuzzy match
  const words = text.split(/\s+/);
  const queryWords = query.split(/\s+/);
  for (const qw of queryWords) {
    for (const tw of words) {
      // Allow 2 character difference for words 5+, 1 for shorter
      const maxDist = qw.length >= 5 ? 2 : 1;
      if (levenshtein(qw, tw) <= maxDist) return true;
      // Also check if query word is prefix of text word
      if (tw.startsWith(qw) || qw.startsWith(tw)) return true;
    }
  }
  return false;
}

// Products
async function getProducts(options = {}) {
  let query = sb.from('products').select('*, categories(*)').eq('active', true);
  if (options.categoryId) query = query.eq('category_id', options.categoryId);
  if (options.search) query = query.or(`name_en.ilike.%${options.search}%,name_ru.ilike.%${options.search}%,name_kz.ilike.%${options.search}%`);
  if (options.sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (options.sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) console.error('getProducts error:', error);
  let results = data || [];

  // If search query and few results, try fuzzy matching on all products
  if (options.search && results.length < 3 && !options.limit) {
    try {
      let allQuery = sb.from('products').select('*, categories(*)').eq('active', true);
      if (options.categoryId) allQuery = allQuery.eq('category_id', options.categoryId);
      const { data: allProducts } = await allQuery;
      if (allProducts) {
        const searchLower = options.search.toLowerCase();
        const fuzzyResults = allProducts.filter(p => {
          return fuzzyMatch(searchLower, p.name_en) ||
                 fuzzyMatch(searchLower, p.name_ru) ||
                 fuzzyMatch(searchLower, p.name_kz) ||
                 fuzzyMatch(searchLower, p.desc_en) ||
                 fuzzyMatch(searchLower, p.desc_ru);
        });
        // Merge: exact matches first, then fuzzy
        const exactIds = new Set(results.map(r => r.id));
        const newFuzzy = fuzzyResults.filter(p => !exactIds.has(p.id));
        results = [...results, ...newFuzzy];
      }
    } catch (e) {
      console.error('Fuzzy search error:', e);
    }
  }

  // Apply sorting
  if (options.sort === 'price_asc') results.sort((a, b) => a.price - b.price);
  else if (options.sort === 'price_desc') results.sort((a, b) => b.price - a.price);

  return results;
}

async function getProduct(id) {
  const { data, error } = await sb.from('products').select('*, categories(*)').eq('id', id).single();
  if (error) console.error('getProduct error:', error);
  return data;
}

async function getCategories() {
  const { data, error } = await sb.from('categories').select('*').order('name_en');
  if (error) console.error('getCategories error:', error);
  return data || [];
}

// Admin - Products
async function adminGetProducts() {
  const { data, error } = await sb.from('products').select('*, categories(*)').order('created_at', { ascending: false });
  return data || [];
}

async function adminSaveProduct(product) {
  const fields = ['name_en', 'name_kz', 'name_ru', 'name_de', 'name_fr', 'name_es', 'name_it', 'name_tr', 'name_pt', 'name_nl', 'name_pl', 'name_ar',
    'desc_en', 'desc_kz', 'desc_ru', 'desc_de', 'desc_fr', 'desc_es', 'desc_it', 'desc_tr', 'desc_pt', 'desc_nl', 'desc_pl', 'desc_ar',
    'price', 'stock', 'category_id', 'images', 'active'];
  const row = {};
  fields.forEach(f => { if (product[f] !== undefined) row[f] = product[f]; });
  if (product.id) {
    const { data, error } = await sb.from('products').update(row).eq('id', product.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await sb.from('products').insert(row).select().single();
    if (error) throw error;
    return data;
  }
}

async function adminDeleteProduct(id) {
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) throw error;
}

// Admin - Orders
async function adminGetOrders() {
  const { data, error } = await sb.from('orders').select('*, products(*)').order('created_at', { ascending: false });
  return data || [];
}

async function adminUpdateOrderStatus(orderId, status) {
  const { error } = await sb.from('orders').update({ status }).eq('id', orderId);
  if (error) throw error;
}

// Auth - Admin (legacy, kept for admin.html compatibility)
async function adminLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function adminLogout() {
  await sb.auth.signOut();
}

async function getAdminSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

// Auth - User
async function userSignUp(email, password, fullName, language, addressData) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, language: language || 'en' } }
  });
  if (error) throw error;
  // Save address fields to profiles table after signup
  if (data.user && addressData) {
    const profileUpdates = {};
    if (addressData.phone) profileUpdates.phone = addressData.phone;
    if (addressData.address) profileUpdates.address = addressData.address;
    if (addressData.city) profileUpdates.city = addressData.city;
    if (addressData.country) profileUpdates.country = addressData.country;
    if (addressData.zip) profileUpdates.zip = addressData.zip;
    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.full_name = fullName;
      profileUpdates.email = email;
      await sb.from('profiles').update(profileUpdates).eq('id', data.user.id);
    }
  }
  return data;
}

async function userSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function userSignOut() {
  await sb.auth.signOut();
}

async function getCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error) {
    console.error('getUserProfile error:', error);
    // Fallback: use auth metadata when profile row doesn't exist
    // Also check if email is in admin list
    const adminEmails = ['serjanyelemesov@gmail.com', 'sundetofficial@gmail.com'];
    return {
      id: user.id,
      full_name: user.user_metadata?.full_name || '',
      email: user.email || '',
      avatar_url: user.user_metadata?.avatar_url || '',
      is_admin: adminEmails.includes(user.email)
    };
  }
  return data;
}

async function updateUserProfile(updates) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  updates.updated_at = new Date().toISOString();
  const { data, error } = await sb.from('profiles').update(updates).eq('id', user.id).select().single();
  if (error) throw error;
  return data;
}

async function isUserAdmin() {
  const profile = await getUserProfile();
  if (!profile) return false;
  if (profile.is_admin === true) return true;
  // Fallback: check email directly
  const user = await getCurrentUser();
  const adminEmails = ['serjanyelemesov@gmail.com', 'sundetofficial@gmail.com'];
  return user && adminEmails.includes(user.email);
}

function onAuthStateChange(callback) {
  return sb.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// User orders
async function getUserOrders() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await sb.from('orders')
    .select('*, products(*)')
    .eq('customer_email', user.email)
    .order('created_at', { ascending: false });
  if (error) console.error('getUserOrders error:', error);
  return data || [];
}

// Upload image to Supabase Storage
async function uploadImage(file) {
  const fileName = `${Date.now()}_${file.name}`;
  const { data, error } = await sb.storage.from('product-images').upload(fileName, file);
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from('product-images').getPublicUrl(fileName);
  return publicUrl;
}

// Upload avatar to Supabase Storage
async function uploadAvatar(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const ext = file.name.split('.').pop();
  const fileName = `avatar_${user.id}_${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('avatars').upload(fileName, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(fileName);
  // Save avatar URL to profile
  await sb.from('profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
  // Also update auth metadata
  await sb.auth.updateUser({ data: { avatar_url: publicUrl } });
  return publicUrl;
}

// Remove background using AI (remove.bg API via serverless function)
async function removeBackground(imageUrl) {
  const response = await fetch('/api/remove-bg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Background removal failed');
  }
  const result = await response.json();
  if (!result.success) throw new Error('Background removal failed');
  // Convert data URL to blob and upload to storage
  const blob = await fetch(result.imageUrl).then(r => r.blob());
  const fileName = `product_${Date.now()}.png`;
  const { data, error } = await sb.storage.from('product-images').upload(fileName, blob, { contentType: 'image/png' });
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from('product-images').getPublicUrl(fileName);
  return publicUrl;
}

// Admin - Add product
async function adminAddProduct(productData) {
  const { data, error } = await sb.from('products').insert([{
    name_en: productData.name_en,
    name_kz: productData.name_kz || '',
    name_ru: productData.name_ru || '',
    desc_en: productData.desc_en || '',
    price: productData.price,
    stock: productData.stock || 0,
    category_id: productData.category_id || null,
    images: productData.images || [],
    active: true
  }]).select();
  if (error) throw error;
  return data[0];
}

// Reviews
async function getReviews(productId) {
  const { data, error } = await sb.from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('approved', true)
    .order('created_at', { ascending: false });
  if (error) console.error('getReviews error:', error);
  return data || [];
}

async function getApprovedReviews(limit = 10) {
  let query = sb.from('reviews')
    .select('*, products(name_en, name_kz, name_ru, images)')
    .eq('approved', true)
    .order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) console.error('getApprovedReviews error:', error);
  return data || [];
}

async function submitReview(review) {
  const { data, error } = await sb.from('reviews').insert(review).select().single();
  if (error) throw error;
  return data;
}

async function uploadReviewImage(file) {
  const fileName = `review_${Date.now()}_${file.name}`;
  const { data, error } = await sb.storage.from('review-images').upload(fileName, file);
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from('review-images').getPublicUrl(fileName);
  return publicUrl;
}

// Admin - Reviews
async function adminGetReviews() {
  const { data, error } = await sb.from('reviews')
    .select('*, products(name_en)')
    .order('created_at', { ascending: false });
  return data || [];
}

async function adminApproveReview(id) {
  const { error } = await sb.from('reviews').update({ approved: true }).eq('id', id);
  if (error) throw error;
}

async function adminDeleteReview(id) {
  const { error } = await sb.from('reviews').delete().eq('id', id);
  if (error) throw error;
}

async function getProductRating(productId) {
  const { data, error } = await sb.from('reviews')
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
