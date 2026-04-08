const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
const pool = require('../config/db');
const { registrarAuditoria } = require('../middlewares/audit');

const generarTokens = (usuario) => {
  const accessToken = jwt.sign(
    { id: usuario.id, username: usuario.username, role: usuario.role, email: usuario.email, full_name: usuario.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const refreshToken = jwt.sign(
    { id: usuario.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      await registrarAuditoria({
        userId: null, action: 'login_fallido', entity: 'auth',
        entityId: null, oldValue: null, newValue: { username },
        ip: req.ip,
      });
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const usuario = result.rows[0];

    if (!usuario.active) {
      return res.status(401).json({ error: 'Usuario desactivado' });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      await registrarAuditoria({
        userId: usuario.id, action: 'login_fallido', entity: 'auth',
        entityId: usuario.id, oldValue: null, newValue: { username },
        ip: req.ip,
      });
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const tokens = generarTokens(usuario);

    await registrarAuditoria({
      userId: usuario.id, action: 'login', entity: 'auth',
      entityId: usuario.id, oldValue: null, newValue: { username },
      ip: req.ip,
    });

    res.json({
      ...tokens,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        email: usuario.email,
        full_name: usuario.full_name,
        role: usuario.role,
      },
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token requerido' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1 AND active = true', [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o desactivado' });
    }

    const usuario = result.rows[0];
    const tokens = generarTokens(usuario);
    res.json(tokens);
  } catch (err) {
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
};

const me = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role FROM users WHERE id = $1',
      [req.usuario.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en me:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'El email es obligatorio' });
    }

    // Buscar usuario con ese email
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);

    // Siempre respondemos igual para no revelar si el email existe
    if (result.rows.length === 0) {
      return res.json({ message: 'Si el email existe en el sistema, recibirás un enlace para restablecer tu contraseña.' });
    }

    const usuario = result.rows[0];

    // Generar token único
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Invalidar tokens anteriores del usuario
    await pool.query('UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false', [usuario.id]);

    // Guardar nuevo token
    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [usuario.id, token, expiresAt]
    );

    // Enviar email
    const resetUrl = `${process.env.CORS_ORIGIN}/reset-password/${token}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: parseInt(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const logoPath = path.resolve(__dirname, '../../logo_GNP.jpg');

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: usuario.email,
      subject: 'Recuperación de contraseña — Grupo Nord Pirineus',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#003278;padding:16px 24px;border-radius:8px 8px 0 0;">
            <img src="cid:logo_gnp" alt="Grupo Nord Pirineus" style="height:40px;" />
          </div>
          <div style="padding:24px;border:1px solid #ddd;border-top:none;">
            <h2 style="color:#003278;margin-top:0;">Recuperación de contraseña</h2>
            <p>Hola <strong>${usuario.full_name || usuario.username}</strong>,</p>
            <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente botón para crear una nueva:</p>
            <div style="text-align:center;margin:30px 0;">
              <a href="${resetUrl}" style="background:#003278;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
                Restablecer Contraseña
              </a>
            </div>
            <p style="color:#666;font-size:13px;">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este email.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
            <p style="color:#999;font-size:11px;">Sistema de Alta de Clientes — Grupo Nord Pirineus</p>
          </div>
        </div>
      `,
      attachments: [{ filename: 'logo_GNP.jpg', path: logoPath, cid: 'logo_gnp' }],
    });

    await registrarAuditoria({
      userId: usuario.id, action: 'recuperar_password', entity: 'auth',
      entityId: usuario.id, oldValue: null, newValue: { email },
      ip: req.ip,
    });

    res.json({ message: 'Si el email existe en el sistema, recibirás un enlace para restablecer tu contraseña.' });
  } catch (err) {
    console.error('Error en forgotPassword:', err);
    // No revelar errores internos al usuario
    res.json({ message: 'Si el email existe en el sistema, recibirás un enlace para restablecer tu contraseña.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Buscar token válido
    const result = await pool.query(
      'SELECT * FROM password_resets WHERE token = $1 AND used = false AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'El enlace no es válido o ha expirado. Solicita uno nuevo.' });
    }

    const resetRecord = result.rows[0];

    // Cambiar contraseña
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, resetRecord.user_id]);

    // Marcar token como usado
    await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [resetRecord.id]);

    await registrarAuditoria({
      userId: resetRecord.user_id, action: 'reset_password', entity: 'auth',
      entityId: resetRecord.user_id, oldValue: null, newValue: { via: 'email_reset' },
      ip: req.ip,
    });

    res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error('Error en resetPassword:', err);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.usuario.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const usuario = result.rows[0];
    const passwordValido = await bcrypt.compare(current_password, usuario.password_hash);
    if (!passwordValido) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, req.usuario.id]);

    await registrarAuditoria({
      userId: req.usuario.id, action: 'cambiar_password', entity: 'auth',
      entityId: req.usuario.id, oldValue: null, newValue: { via: 'cambio_manual' },
      ip: req.ip,
    });

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error en changePassword:', err);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
};

module.exports = { login, refreshToken, me, forgotPassword, resetPassword, changePassword };
