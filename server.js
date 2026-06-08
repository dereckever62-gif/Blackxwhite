const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./mafia.db');

// Configuración para guardar las imágenes con su extensión original (.jpg, .png)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// CÓDIGO SECRETO DE ADMINISTRADOR
const CODIGO_ADMIN_SECRETO = "MAFIA_SA_MP_2026";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: 'secreto_ultra_seguro_mafia',
    resave: false,
    saveUninitialized: true
}));

// Crear tablas de la base de datos automáticamente
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        rol TEXT DEFAULT 'miembro'
    )`);

    // Añadimos la columna "tipo" para saber si es Banco, Casino o Petro
    db.run(`CREATE TABLE IF NOT EXISTS robos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        titulo TEXT,
        tipo TEXT,
        descripcion TEXT,
        imagen_url TEXT,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    )`);
});

// RUTA PRINCIPAL
app.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Registro de usuarios
app.post('/registro', async (req, res) => {
    const { username, password, codigoAdmin } = req.body;
    if(!username || !password) return res.send("Por favor, rellena todos los campos.");

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const rol = (codigoAdmin === CODIGO_ADMIN_SECRETO) ? 'admin' : 'miembro';

        db.run(`INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)`, 
        [username, hashedPassword, rol], function(err) {
            if (err) return res.send("El nombre de usuario ya existe o hubo un error. <a href='/'>Volver</a>");
            res.send(`Registro exitoso como ${rol}. <a href="/">Iniciar Sesión aquí</a>`);
        });
    } catch {
        res.send("Error en el registro.");
    }
});

// Inicio de Sesión
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get(`SELECT * FROM usuarios WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.send("Usuario no encontrado. <a href='/'>Volver</a>");
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.send("Contraseña incorrecta. <a href='/'>Volver</a>");

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.rol = user.rol;

        res.redirect('/dashboard');
    });
});

// Cerrar Sesión
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// PANEL DE CONTROL (DASHBOARD)
app.get('/dashboard', (req, res) => {
    if (!req.session.userId) return res.send("Acceso denegado. <a href='/'>Inicia sesión</a>");

    db.all(`SELECT robos.*, usuarios.username FROM robos JOIN usuarios ON robos.usuario_id = usuarios.id ORDER BY robos.id DESC`, [], (err, robos) => {
        if (err) return res.send("Error al cargar los robos.");

        // Función auxiliar para armar los bloques de robos de cada categoría
        const generarHTMLRobo = (r) => `
            <div style="border: 1px solid #444; padding: 12px; margin-bottom: 15px; background: #252525; border-radius: 5px;">
                <h4 style="color: #fff; margin: 0 0 5px 0;">📌 ${r.titulo}</h4>
                <p style="color: #888; font-size: 11px; margin: 0 0 8px 0;">Por: <b>${r.username}</b></p>
                <p style="white-space: pre-wrap; font-size: 13px; color: #ddd; margin: 0 0 10px 0;">${r.descripcion}</p>
                ${r.imagen_url ? `<img src="${r.imagen_url}" style="max-width: 100%; border-radius:3px; margin-bottom:10px;" /><br>` : ''}
                ${req.session.rol === 'admin' ? `<a href="/borrar-robo/${r.id}" style="background: #8b0000; color: white; padding: 3px 6px; text-decoration: none; font-weight: bold; border-radius:3px; font-size:11px; display:inline-block;">ELIMINAR</a>` : ''}
            </div>
        `;

        // Filtramos los robos por cada sección
        let robosBanco = robos.filter(r => r.tipo === 'banco').map(generarHTMLRobo).join('');
        let robosCasino = robos.filter(r => r.tipo === 'casino').map(generarHTMLRobo).join('');
        let robosPetro = robos.filter(r => r.tipo === 'petro').map(generarHTMLRobo).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Panel de la Mafia</title>
                <style>
                    body { background: #111; color: #fff; font-family: Arial, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
                    input, textarea, select { width: 100%; padding: 10px; margin-bottom: 10px; background: #333; color: white; border: 1px solid #555; box-sizing: border-box; border-radius:4px; }
                    button { background: #ff3333; color: white; padding: 12px 20px; border: none; cursor: pointer; font-weight: bold; width: 100%; border-radius:4px; }
                    button:hover { background: #cc0000; }
                    a { color: #55ff55; text-decoration: none; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;}
                    
                    /* Diseño de 3 columnas para las secciones */
                    .columnas-container { display: flex; gap: 20px; flex-wrap: wrap; }
                    .columna { flex: 1; min-width: 300px; background: #1a1a1a; padding: 15px; border-radius: 5px; border: 1px solid #333; }
                    .columna h3 { text-align: center; border-bottom: 2px solid #ff3333; padding-bottom: 8px; margin-top: 0; color: #ff3333; }
                    .vacio { color: #666; text-align: center; font-size: 13px; font-style: italic; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>🕶️ Panel: ${req.session.username} (<span style="color:red">${req.session.rol}</span>)</h2>
                    <a href="/logout" style="color: #ff3333; font-weight:bold;">[Salir]</a>
                </div>

                <div style="background: #1a1a1a; padding: 20px; border-radius: 5px; margin-bottom: 30px; border: 1px solid #333;">
                    <h3 style="margin-top:0; color:#ff3333;">Registrar Nuevo Robo</h3>
                    <form action="/subir-robo" method="POST" enctype="multipart/form-data">
                        <input type="text" name="titulo" placeholder="Título corto (Ej: Asalto Nocturno)" required>
                        
                        <label style="color:#aaa; display:block; margin-bottom:5px;">Selecciona el tipo de golpe:</label>
                        <select name="tipo" required>
                            <option value="banco">🏦 Robo al Banco</option>
                            <option value="casino">🎰 Robo al Casino</option>
                            <option value="petro">🛢️ Robo Petro</option>
                        </select>

                        <textarea name="descripcion" rows="4" placeholder="Describe cómo se hizo el atraco, miembros participantes, plan de escape..." required></textarea>
                        
                        <label style="display:block; margin-bottom:5px; color:#aaa;">Evidencia fotográfica (SS):</label>
                        <input type="file" name="imagen" accept="image/*" required>
                        
                        <button type="submit">PUBLICAR REPORTE</button>
                    </form>
                </div>

                <h2>📋 Historial de Actividad Criminal</h2>
                
                <div class="columnas-container">
                    
                    <div class="columna">
                        <h3>🏦 Robo al Banco</h3>
                        ${robosBanco.length === 0 ? '<p class="vacio">No hay robos al banco registrados.</p>' : robosBanco}
                    </div>

                    <div class="columna">
                        <h3>🎰 Robo al Casino</h3>
                        ${robosCasino.length === 0 ? '<p class="vacio">No hay robos al casino registrados.</p>' : robosCasino}
                    </div>

                    <div class="columna">
                        <h3>🛢️ Robo Petro</h3>
                        ${robosPetro.length === 0 ? '<p class="vacio">No hay robos petro registrados.</p>' : robosPetro}
                    </div>

                </div>
            </body>
            </html>
        `);
    });
});

// Guardar los robos en la base de datos
app.post('/subir-robo', upload.single('imagen'), (req, res) => {
    if (!req.session.userId) return res.send("No autorizado");
    
    const { titulo, tipo, descripcion } = req.body;
    const imagen_url = req.file ? `/uploads/${req.file.filename}` : null;

    db.run(`INSERT INTO robos (usuario_id, titulo, tipo, descripcion, imagen_url) VALUES (?, ?, ?, ?, ?)`,
    [req.session.userId, titulo, tipo, descripcion, imagen_url], (err) => {
        if (err) return res.send("Error al guardar el reporte.");
        res.redirect('/dashboard');
    });
});

// Eliminar un robo (Solo Admin)
app.get('/borrar-robo/:id', (req, res) => {
    if (!req.session.userId || req.session.rol !== 'admin') {
        return res.send("No tienes rango de administrador para hacer esto.");
    }

    const roboId = req.params.id;
    db.run(`DELETE FROM robos WHERE id = ?`, [roboId], (err) => {
        if (err) return res.send("Error al borrar el registro.");
        res.redirect('/dashboard');
    });
});

app.listen(3000, () => console.log("Servidor iniciado en http://localhost:3000"));