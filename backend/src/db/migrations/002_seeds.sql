-- Usuario admin inicial (password: admin123)
-- Hash bcrypt generado con salt 12
INSERT INTO users (username, password_hash, email, full_name, role)
VALUES ('admin', '$2b$12$LJ3m4ys3GZ9yNRqiEkMpHOx0YS8Xjg5GkJvN8KqWl3qGDHzHK5gS', 'admin@example.com', 'Administrador', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Datos demo de plantas
INSERT INTO plants (code, name) VALUES
  ('PL001', 'Planta Madrid'),
  ('PL002', 'Planta Barcelona'),
  ('PL003', 'Planta Valencia')
ON CONFLICT (code) DO NOTHING;

-- Comerciales demo
INSERT INTO commercials (code, name) VALUES
  ('COM001', 'Juan García'),
  ('COM002', 'María López'),
  ('COM003', 'Pedro Martínez')
ON CONFLICT (code) DO NOTHING;

-- Acciones de cliente
INSERT INTO client_actions (code, name) VALUES
  ('ALTA', 'Alta nueva'),
  ('MOD', 'Modificación'),
  ('REACT', 'Reactivación')
ON CONFLICT (code) DO NOTHING;

-- Clases de cliente
INSERT INTO client_classes (code, name) VALUES
  ('HOR', 'Hostelería'),
  ('ALI', 'Alimentación'),
  ('COM', 'Comercio'),
  ('IND', 'Industria')
ON CONFLICT (code) DO NOTHING;

-- Tipos de facturación
INSERT INTO billing_types (code, name) VALUES
  ('FAC', 'Factura'),
  ('REC', 'Recibo'),
  ('ALB', 'Albarán valorado')
ON CONFLICT (code) DO NOTHING;

-- Formas de pago
INSERT INTO payment_methods (code, name) VALUES
  ('EFE', 'Efectivo'),
  ('TRF', 'Transferencia'),
  ('DOM', 'Domiciliación'),
  ('CHQ', 'Cheque')
ON CONFLICT (code) DO NOTHING;

-- Periodos de visita
INSERT INTO visit_periods (code, name) VALUES
  ('SEM', 'Semanal'),
  ('QUI', 'Quincenal'),
  ('MEN', 'Mensual')
ON CONFLICT (code) DO NOTHING;
