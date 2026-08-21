// Supabase client configuration
const SUPABASE_URL = 'https://wmznfdngucpsmjbxiwzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

let sb = null;

function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.sb = sb;
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
  // Search across ALL language fields so users find products no matter what language they search in
  if (options.search) {
    const searchTerm = options.search;
    const allNameFields = ['name_en','name_kz','name_ru','name_de','name_fr','name_es','name_it','name_tr','name_pt','name_nl','name_pl','name_ar'];
    const conditions = allNameFields.map(f => `${f}.ilike.%${searchTerm}%`).join(',');
    query = query.or(conditions);
  }
  if (options.sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (options.sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
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
          // Check ALL language name fields
          const nameFields = ['name_en','name_kz','name_ru','name_de','name_fr','name_es','name_it','name_tr','name_pt','name_nl','name_pl','name_ar'];
          const descFields = ['desc_en','desc_kz','desc_ru','desc_de','desc_fr','desc_es','desc_it','desc_tr','desc_pt','desc_nl','desc_pl','desc_ar'];
          for (const f of nameFields) {
            if (fuzzyMatch(searchLower, p[f])) return true;
          }
          for (const f of descFields) {
            if (fuzzyMatch(searchLower, p[f])) return true;
          }
          return false;
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
  const { data, error } = await sb.from('products').select('*, categories(*)').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  return data || [];
}

// Update product sort order (drag-and-drop reordering)
async function updateProductOrder(productIds) {
  const updates = productIds.map((id, index) => ({ id, sort_order: index }));
  // Batch update in chunks of 50
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    await Promise.all(chunk.map(u => sb.from('products').update({ sort_order: u.sort_order }).eq('id', u.id)));
  }
}

async function adminSaveProduct(product) {
  const fields = ['name_en', 'name_kz', 'name_ru', 'name_de', 'name_fr', 'name_es', 'name_it', 'name_tr', 'name_pt', 'name_nl', 'name_pl', 'name_ar',
    'desc_en', 'desc_kz', 'desc_ru', 'desc_de', 'desc_fr', 'desc_es', 'desc_it', 'desc_tr', 'desc_pt', 'desc_nl', 'desc_pl', 'desc_ar',
    'price', 'stock', 'category_id', 'images', 'active', 'type', 'type2', 'type3', 'type4', 'type5',
    'type_image', 'type_image2', 'type_image3', 'type_image4', 'type_image5',
    // Variants (legacy flat array [{label, price, stock}, ...]).
    'types',
    // Alibaba-style option groups: [{name, type, options:[{label, price_mod, color_hex, image?}, ...]}, ...].
    'option_groups',
    // Optional product video (YouTube / Vimeo / MP4). Added by
    // fix-add-video-url.sql; the admin save helper self-heals if the migration
    // has not yet been applied.
    'video_url'];
  const row = {};
  fields.forEach(f => { if (product[f] !== undefined) row[f] = product[f]; });

  // Self-heal: if the PostgREST schema cache complains that a column doesn't
  // exist on the products table (because the corresponding fix-*.sql migration
  // wasn't run on Supabase yet, or the schema cache is stale), strip that
  // column and retry so the save still succeeds. PostgREST error PGRST204
  // has the form:
  //   "Could not find the 'option_groups' column of 'products' in the schema cache"
  // Strip up to 5 columns per save to handle a chain of new fields at once.
  const missing = new Set();
  const payload = { ...row };
  // First try + up to 5 self-healing retries (= 6 attempts total).
  for (let i = 0; i < 6; i++) {
    try {
      if (product.id) {
        const { data, error } = await sb.from('products').update(payload).eq('id', product.id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await sb.from('products').insert(payload).select().single();
        if (error) throw error;
        return data;
      }
    } catch (e) {
      const msg = (e && e.message) || '';
      const m = msg.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/);
      if (!m) throw e;
      const col = m[1];
      if (missing.has(col) || payload[col] === undefined) throw e;
      missing.add(col);
      console.warn(
        `[adminSaveProduct] column "${col}" not found in products schema — ` +
        `retrying save without it. Run the matching fix-*.sql migration on Supabase ` +
        `(e.g. fix-add-option-groups.sql for "${col}") and then ` +
        `NOTIFY pgrst, 'reload schema'; to enable the field.`
      );
      delete payload[col];
    }
  }
  throw new Error('adminSaveProduct: too many missing columns in schema cache: ' +
    [...missing].join(', '));
}

async function adminDeleteProduct(id) {
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) throw error;
}

// Admin - Orders
async function adminGetOrders() {
  const { data, error } = await sb.from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });
  if (error) console.error('adminGetOrders error:', error);
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

// Require an already-enrolled TOTP factor for privileged admin sessions.
// First-time admins are not locked out: they can enroll from the Supabase
// dashboard, after which every admin login must complete the 6-digit challenge.
async function requireAdminMfa() {
  if (!sb?.auth?.mfa) return true;
  const { data: factors, error: factorsError } = await sb.auth.mfa.listFactors();
  if (factorsError) throw factorsError;
  const factor = (factors?.totp || []).find(item => item.status === 'verified');
  if (!factor) return true;

  const { data: sessionData } = await sb.auth.getSession();
  const aal = sessionData?.session?.user?.aal || sessionData?.session?.user?.app_metadata?.aal;
  if (aal === 'aal2') return true;

  const { data: challenge, error: challengeError } = await sb.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError) throw challengeError;
  const code = window.prompt('Қауіпсіздік коды / Enter your 6-digit authenticator code:');
  if (!/^\\d{6}$/.test(String(code || '').trim())) throw new Error('MFA code required');
  const { error: verifyError } = await sb.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: String(code).trim()
  });
  if (verifyError) throw verifyError;
  return true;
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

// Password reset — sends a recovery email with a link
async function resetPassword(email) {
  if (!email) throw new Error('Email is required');
  // Сілтеме account.html#settings бетіне барады — сол жерде access_token
  // автоматты түрде анықталып, "Жаңа пароль орнату" формасы ашылады
  const redirectTo = window.location.origin + '/account.html#settings';
  const { data, error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
  return data;
}

// Update password (used after user clicks the recovery link)
async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters');
  const { data, error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
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

// User orders — user_id НЕМЕСЕ customer_email бойынша іздеу
// (user_id сенімдірек, себебі email checkout кезінде басқаша болуы мүмкін)
async function getUserOrders() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await sb.from('orders')
    .select('*, order_items(*)')
    .or(`user_id.eq.${user.id},customer_email.eq.${user.email}`)
    .order('created_at', { ascending: false });
  if (error) console.error('getUserOrders error:', error);
  return data || [];
}

// Upload image to Supabase Storage
function getImageContentType(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('image/') && type !== 'image/avif') return type;
  const name = String(file?.name || '').toLowerCase();
  if (type === 'image/avif' || /\.avif$/i.test(name)) return 'image/avif';
  return type.startsWith('image/') ? type : 'application/octet-stream';
}

function isAvifFile(file) {
  return getImageContentType(file) === 'image/avif' || /\.avif$/i.test(String(file?.name || ''));
}

// Older Supabase buckets may still reject image/avif until their allowed MIME
// list is updated. In that case, decode the AVIF in the browser and upload a
// PNG fallback so the admin can still save the Type/Option image immediately.
// When the bucket allows AVIF, the original file is uploaded unchanged.
async function convertAvifToPng(file) {
  let bitmap = null;
  let objectUrl = '';
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Browser could not convert AVIF');
      return new File([blob], String(file.name || 'image').replace(/\.avif$/i, '') + '.png', { type: 'image/png' });
    }

    objectUrl = URL.createObjectURL(file);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Browser cannot decode AVIF'));
      img.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Browser could not convert AVIF');
    return new File([blob], String(file.name || 'image').replace(/\.avif$/i, '') + '.png', { type: 'image/png' });
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function uploadImage(file) {
  const originalName = String(file?.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}_${originalName}`;
  const uploadOptions = { contentType: getImageContentType(file) };
  let { data, error } = await sb.storage.from('product-images').upload(fileName, file, uploadOptions);

  if (error && isAvifFile(file)) {
    try {
      const fallbackFile = await convertAvifToPng(file);
      const fallbackName = `${Date.now()}_${String(fallbackFile.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const fallback = await sb.storage.from('product-images').upload(fallbackName, fallbackFile, { contentType: 'image/png' });
      data = fallback.data;
      error = fallback.error;
    } catch (conversionError) {
      throw new Error('AVIF upload failed and browser conversion was unavailable: ' + conversionError.message);
    }
  }

  if (error) throw error;
  const publicPath = data?.path || fileName;
  const { data: { publicUrl } } = sb.storage.from('product-images').getPublicUrl(publicPath);
  return publicUrl;
}

/**
 * Upload a product video to the product-videos bucket. Returns the public URL
 * that the product page can use for its <video> player.
 */
async function uploadVideo(file) {
  const originalName = String(file?.name || 'video').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}_${originalName}`;
  const contentType = file.type || 'video/mp4';
  const { data, error } = await sb.storage.from('product-videos').upload(fileName, file, { contentType });
  if (error) throw new Error(error.message || 'Video upload failed');
  const publicPath = data?.path || fileName;
  const { data: { publicUrl } } = sb.storage.from('product-videos').getPublicUrl(publicPath);
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
  const response = await fetch('/api/ai-tools?action=remove-bg', {
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

async function submitReview(review, productData) {
  // 1. Пікірді сақтау — WITHOUT .select() because SELECT RLS only allows approved=true
  const { error } = await sb.from('reviews').insert(review);
  if (error) throw error;

  // 2. Админге хабарлама жіберу (ЖАҢА ҚОСЫЛДЫ)
  // Пікір деректерін тікелей жібереміз (ID-мен емес), API service_role арқылы іздейді
  fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'notify-review', review, product: productData || null })
  }).catch(err => console.warn('Admin notification failed:', err));

  return review;
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

// ===== Favorites / Wishlist =====
async function toggleFavorite(productId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('NOT_LOGGED_IN');
  // Check if already favorited
  const { data: existing } = await sb.from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productId)
    .maybeSingle();
  if (existing) {
    // Remove favorite
    const { error } = await sb.from('favorites').delete().eq('id', existing.id);
    if (error) throw error;
    return false; // removed
  } else {
    // Add favorite
    const { error } = await sb.from('favorites').insert({ user_id: user.id, product_id: productId });
    if (error) throw error;
    return true; // added
  }
}

async function getUserFavorites() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await sb.from('favorites')
    .select('product_id')
    .eq('user_id', user.id);
  if (error) { console.error('getUserFavorites error:', error); return []; }
  return (data || []).map(r => r.product_id);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}

// ============================================================================
// ON-DEMAND FREE TRANSLATION (no AI / no LLM)
// ============================================================================
//
// How it works:
//   1. Visitor opens a product page and the chrome has them on, say, Kazakh.
//   2. product.html calls getProduct(id). If name_kz / desc_kz exist on the row,
//      we render them directly (cached by previous visitors).
//   3. If they're missing, we fire-and-forget a POST to
//      /api/translate-product with { mode: 'free', product_id, target_lang }.
//      That endpoint calls MyMemory → LibreTranslate and writes the result
//      back to the products table so the next visitor gets an instant hit.
//   4. When the API responds, we patch the rendered DOM with the new text.
//
// In browsers we cache the (product_id+lang) → translation promise for the
// duration of the page so a quick product grid re-rendering won't fire
// duplicate requests.
//
// We never block the UI on this: English text is shown instantly, then
// silently swapped for the translated copy within ~300–1500 ms.
const _odTranslationCache = new Map(); // 'pid:lang' -> Promise<{name, desc}>
const _OD_CACHE_MAX = 200; // FIFO-evict above this to keep long-lived tabs bounded

const _variantLabelTranslationCache = new Map();

async function ensureProductLabelTranslations(productId, targetLang, labels) {
  if (!productId || !targetLang || targetLang === 'en' || !labels || !Object.keys(labels).length) return {};
  const labelEntries = Object.entries(labels).filter(([, value]) => String(value || '').trim()).slice(0, 100);
  if (!labelEntries.length) return {};
  const key = `${productId}:${targetLang}:${JSON.stringify(labelEntries)}`;
  if (_variantLabelTranslationCache.has(key)) return _variantLabelTranslationCache.get(key);
  const promise = (async () => {
    try {
      const resp = await fetch('/api/translate-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'free', target_lang: targetLang, labels: Object.fromEntries(labelEntries) })
      });
      if (!resp.ok) return {};
      const data = await resp.json();
      return data && data.success && data.labels ? data.labels : {};
    } catch (e) {
      console.warn('[ensureProductLabelTranslations] fetch error:', e);
      return {};
    }
  })();
  _variantLabelTranslationCache.set(key, promise);
  return promise;
}

async function ensureProductTranslation(productId, targetLang, sourceDesc, options) {
  options = options || {};
  const nameOnly = options.nameOnly === true;
  if (!productId || !targetLang || targetLang === 'en') return null;
  if (!SUPPORTED_LANGS_TRANSLATE.includes(targetLang)) return null;

  // Keep the fast title request separate from the full name+description
  // request. A long supplier description must never delay a product title.
  const key = `${productId}:${targetLang}${nameOnly ? ':name' : ''}`;
  if (_odTranslationCache.has(key)) return _odTranslationCache.get(key);

  const p = (async () => {
    try {
      // Hit the unified /api/translate-product endpoint with mode:'free'
      // so it uses MyMemory → LibreTranslate (no AI / no LLM) and writes
      // the result back to the products table for next visitor.
      const resp = await fetch('/api/translate-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'free',
          product_id: productId,
          target_lang: targetLang,
          ...(nameOnly ? { name_only: true } : {})
        })
      });
      // A transient gateway/provider failure must not poison the in-page cache.
      // Otherwise switching kz/ru again keeps returning the same rejected
      // promise until the whole tab is reloaded.
      if (!resp.ok) {
        _odTranslationCache.delete(key);
        return null;
      }
      const data = await resp.json();
      if (!data || !data.success) {
        _odTranslationCache.delete(key);
        return null;
      }
      const translation = data.translation || null;
      // Do not permanently cache a partial result. Name and description need
      // independent retries: a free provider may return one field while the
      // other is rate-limited or echoed in English.
      const missingName = !translation || !String(translation.name || '').trim();
      const missingDesc = !nameOnly && String(sourceDesc || '').trim() &&
        (!translation || !String(translation.desc || '').trim() ||
         isEnglishCopy(translation.desc, sourceDesc));
      if (missingName || missingDesc) _odTranslationCache.delete(key);
      return translation;
    } catch (e) {
      // Network timeouts must be retryable as well as HTTP failures. Do not
      // leave a null promise in the per-tab cache for this language.
      _odTranslationCache.delete(key);
      console.warn('[ensureProductTranslation] fetch error:', e);
      return null;
    }
  })();
  _odTranslationCache.set(key, p);
  // Cap cache size so a long-lived tab visiting many products × languages
  // doesn't grow the map unbounded. Map iteration order is insertion
  // order, so deleting the first key (oldest) gives us FIFO eviction.
  if (_odTranslationCache.size > _OD_CACHE_MAX) {
    const firstKey = _odTranslationCache.keys().next().value;
    if (firstKey) _odTranslationCache.delete(firstKey);
  }
  return p;
}

// Fast title-only translation used by product cards and the product heading.
// It deliberately does not wait for the potentially long HTML description.
async function ensureProductNameTranslation(productId, targetLang) {
  return ensureProductTranslation(productId, targetLang, '', { nameOnly: true });
}

// True when `value` is just the English source copied into a target-language
// column (a known legacy data problem: desc_kz etc. were written back as
// verbatim English). Used by grids and product pages to decide whether an
// on-demand translation is actually needed.
function isEnglishCopy(value, sourceEn) {
  if (!value || !sourceEn) return false;
  const a = String(value).toLowerCase().trim();
  const b = String(sourceEn).toLowerCase().trim();
  if (!a || !b) return false;
  // Exact copy — the reliable signal for plain-text names.
  if (a === b) return true;
  // For HTML descriptions, compare the visible text (tags stripped) by
  // prefix — different formatting/whitespace between the raw stored copy
  // and the source would otherwise hide an exact English copy. Only applied
  // when the value looks like markup, so brand names with a translated
  // suffix (e.g. "iPhone Case Black" → "iPhone Case Black қорап") are
  // never misflagged as English copies.
  if (String(value).includes('<') && String(sourceEn).includes('<')) {
    const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const va = strip(a), vb = strip(b);
    if (!va || !vb) return false;
    const n = Math.min(120, va.length, vb.length);
    return va.slice(0, n) === vb.slice(0, n);
  }
  return false;
}

// Helper for grids/catalogs: translate a list of products sequentially based
// on the user's current language. Mutates each product's name_XX / desc_XX
// in place so subsequent renders show the translated copy.
//
// Sequential (with a small per-product delay) because free translation APIs
// have very tight rate limits when called in parallel — MyMemory's anonymous
// tier caps at ~5 req/min, LibreTranslate public instances throttle to
// ~20 req/min. Firing 30+ requests in parallel gets most of them rejected.
// For grids of 30 products this runs in the background over ~15 s and
// patches the DOM as each translation comes back. The server endpoint also
// writes the result back to Supabase, so subsequent page loads hit cache.
async function ensureProductsTranslated(products, targetLang, opts) {
  opts = opts || {};
  if (!Array.isArray(products) || products.length === 0) return products;
  if (!targetLang || targetLang === 'en') return products;
  if (!SUPPORTED_LANGS_TRANSLATE.includes(targetLang)) return products;
  // Default 800 ms stagger keeps a 30-product grid well under the free
  // tier's limit. Backoff on the first failed request so we don't hammer
  // the API during a transient outage.
  const stagger = typeof opts.staggerMs === 'number' ? opts.staggerMs : 800;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p || !p.id || !p.name_en) continue;
    // Skip products that already carry a REAL translation in the target
    // column — they render instantly from the DB row and don't need a
    // server round-trip. English-copy rows (leftover source text written
    // into the target column by earlier bugs) are NOT skipped: the server
    // detects them as not-cached and returns a fresh translation, which
    // avoids rendering stale English-after-language-switch rows.
    const existingName = p['name_' + targetLang];
    const existingDesc = p['desc_' + targetLang];
    const hasTranslatedName = !!String(existingName || '').trim() &&
      !isEnglishCopy(existingName, p.name_en);
    const hasTranslatedDesc = !String(p.desc_en || '').trim() ||
      (!!String(existingDesc || '').trim() && !isEnglishCopy(existingDesc, p.desc_en));
    // Translate the title independently first. This keeps cards responsive
    // even when the description contains many HTML chunks or a provider is
    // slow on description requests.
    let t = null;
    if (!hasTranslatedName) {
      t = await ensureProductNameTranslation(p.id, targetLang);
      if (t && t.name && !isEnglishCopy(t.name, p.name_en)) {
        p['name_' + targetLang] = t.name;
      }
      if (typeof opts.onUpdate === 'function' && t && t.name) {
        try { opts.onUpdate(p, { name: t.name, desc: '' }); } catch (_) { /* non-fatal */ }
      }
    }

    // Description translation remains independent and can continue in the
    // background. If the title was already cached, this is the only request.
    if (!hasTranslatedDesc) {
      t = await ensureProductTranslation(p.id, targetLang, p.desc_en);
      if (t && t.name && !isEnglishCopy(t.name, p.name_en)) {
        p['name_' + targetLang] = t.name;
      }
      if (t && t.desc && !isEnglishCopy(t.desc, p.desc_en)) {
        p['desc_' + targetLang] = t.desc;
      }
    }
    if (typeof opts.onUpdate === 'function' && t && (t.name || t.desc)) {
      try { opts.onUpdate(p, t); } catch (_) { /* non-fatal */ }
    }
    if (i < products.length - 1) {
      await new Promise(r => setTimeout(r, stagger));
    }
  }
  return products;
}

// The list of language keys SunTrade uses for the product DB columns.
// Listed once for the helpers above; SUPABASE_LANGS would be a fine alias
// for the existing arrays scattered in this file, but keeping it local here
// avoids touching unrelated call sites.
const SUPPORTED_LANGS_TRANSLATE = ['kz','ru','de','fr','es','it','tr','pt','nl','pl','ar'];
