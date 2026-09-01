-- visitor_events кестесіне phone бағанын қосу (егер жоқ болса)
ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';

-- orders кестесінен customer_phone алып, visitor_events-ке жазу
-- Бұл тапсырыс жасаған қонақтардың телефондарын сақтайды
UPDATE visitor_events ve
SET phone = subq.customer_phone
FROM (
  SELECT DISTINCT ON (ve2.visitor_id) 
    ve2.visitor_id,
    o.customer_phone
  FROM visitor_events ve2
  JOIN orders o ON o.customer_phone IS NOT NULL AND o.customer_phone != ''
  WHERE ve2.phone = ''
  AND ve2.event_type = 'add_to_cart'
  ORDER BY ve2.visitor_id, o.created_at DESC
) subq
WHERE ve.visitor_id = subq.visitor_id
AND ve.phone = '';
