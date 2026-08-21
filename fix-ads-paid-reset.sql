-- Fix: Reset all ads to unpaid. Only Stripe-confirmed ads should be paid=true.
-- Run this in Supabase SQL Editor

UPDATE ads SET paid = false;
