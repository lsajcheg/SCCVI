
const express = require("express");
const path = require("path");
require("dotenv").config();

// ==========================================
// BASE DE DATOS
// ==========================================

const pool = require("./config/db");

// ==========================================
// SESIONES
// ==========================================

const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

// ==========================================
// AUTENTICACIÓN
// ==========================================

const {
    requiereAutenticacion,
    requiereRol
} = require("./middleware/auth");

const rutasAuth = require("./routes/auth");

const recuperacionRoutes = require("./routes/recuperacion");

// ==========================================
// CREAR APLICACIÓN
// ==========================================

const app = express();
app.get("/olvide-contrasena", (req, res) => {
    res.sendFile(
        path.join(__dirname, "views", "olvide-contrasena.html")
    );
});
app.get("/restablecer-contrasena", (req, res) => {
    res.set("Referrer-Policy", "no-referrer");
    res.set("Cache-Control", "no-store");

    res.sendFile(
        path.join(__dirname, "views", "restablecer-contrasena.html")
    );
});

// ==========================================
// CONFIGURACIÓN GENERAL
// ==========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// VALIDAR SESSION_SECRET
// ==========================================

if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
) {
    throw new Error(
        "Configura SESSION_SECRET con al menos 32 caracteres en .env"
    );
}

// ==========================================
// CONFIGURACIÓN DE SESIONES
// ==========================================

app.use(session({
    store: new PgSession({
        pool: pool,
        tableName: "session",
        createTableIfMissing: true
    }),

    name: "sccvi.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 2
    }
}));

// ==========================================
// ARCHIVOS PÚBLICOS
// ==========================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ==========================================
// LOGIN
// ==========================================

app.get("/login", (req, res) => {

    if (req.session?.usuario) {
        return res.redirect("/");
    }

    res.sendFile(
        path.join(__dirname, "views", "login.html")
    );
});

// ==========================================
// API DE AUTENTICACIÓN
// ==========================================

app.use("/api/auth", rutasAuth);
app.use("/api/auth", recuperacionRoutes);

// ==========================================
// CARNET DIGITAL - API PARA RESPONSABLES
// ==========================================
// No requiere iniciar sesión administrativa.
// La API verifica el QR y el PIN.

app.use(
    "/api/carnet-publico",
    require("./routes/carnetPublico")
);


// ==========================================
// CARNET DIGITAL - VISTA PÚBLICA
// ==========================================

app.get("/consulta-carnet/:token", (req, res) => {

    const token = req.params.token;

    const formatoUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const tokenValido = formatoUUID.test(token);

    // DIAGNÓSTICO TEMPORAL
    // No imprimir el token completo.

    console.log("==================================");
    console.log("CONSULTA PÚBLICA DEL CARNET");
    console.log("LONGITUD:", token.length);
    console.log("UUID VÁLIDO:", tokenValido);
    console.log(
        "GRUPOS:",
        token.split("-").map(grupo => grupo.length)
    );
    console.log("==================================");

    if (!tokenValido) {
        return res.status(404).send(
            "Enlace de carnet no válido"
        );
    }

    res.set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow"
    });

    return res.sendFile(
        path.join(
            __dirname,
            "views",
            "consulta-carnet.html"
        )
    );

});

// ==========================================
// PROTECCIÓN DEL SISTEMA ADMINISTRATIVO
// ==========================================
// Todas las rutas registradas después de
// este middleware requieren iniciar sesión.

app.use(requiereAutenticacion);

// ==========================================
// ADMINISTRACIÓN DE USUARIOS
// ==========================================

app.use(
    "/api/usuarios",
    require("./routes/usuarios")
);

app.get(
    "/usuarios",
    requiereRol("administrador"),
    (req, res) => {

        res.sendFile(
            path.join(__dirname, "views", "usuarios.html")
        );

    }
);

// ==========================================
// REPORTES
// ==========================================

app.use(
    "/api/reportes",
    require("./routes/reportes")
);

app.get("/reportes", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "reportes.html")
    );

});

// ==========================================
// PÁGINA PRINCIPAL
// ==========================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "index.html")
    );

});

// ==========================================
// COMPROBAR CONEXIÓN A POSTGRESQL
// ==========================================

app.get("/test-db", async (req, res) => {

    try {

        const resultado = await pool.query(
            "SELECT NOW() AS fecha"
        );

        res.json({
            mensaje: "Conexión exitosa a PostgreSQL",
            fecha: resultado.rows[0].fecha
        });

    } catch (error) {

        console.error("ERROR BD:", error);

        res.status(500).json({
            mensaje: "Error de conexión a PostgreSQL"
        });

    }

});

// ==========================================
// MÓDULO 1: COMUNIDADES
// ==========================================

const rutasComunidades = require("./routes/comunidades");

app.use(
    "/api/comunidades",
    rutasComunidades
);

app.get("/comunidades", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "comunidades.html")
    );

});

// ==========================================
// MÓDULO 2: PADRES Y RESPONSABLES
// ==========================================

const rutasPadres = require("./routes/padres");

app.use(
    "/api/padres",
    rutasPadres
);

app.get("/padres", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "padres.html")
    );

});

// ==========================================
// MÓDULO 3: NIÑOS
// ==========================================

const rutasNinos = require("./routes/ninos");

app.use(
    "/api/ninos",
    rutasNinos
);

app.get("/ninos", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "ninos.html")
    );

});

// ==========================================
// MÓDULO 4: CONTROL DE CRECIMIENTO
// ==========================================

const rutasCrecimiento = require("./routes/crecimiento");

app.use(
    "/api/crecimiento",
    rutasCrecimiento
);

app.get("/crecimiento", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "crecimiento.html")
    );

});

// ==========================================
// MÓDULO 5: VACUNACIÓN
// ==========================================

const rutasVacunacion = require("./routes/vacunacion");

app.use(
    "/api/vacunacion",
    rutasVacunacion
);

app.get("/vacunacion", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "vacunacion.html")
    );

});

// ==========================================
// SUBMÓDULO: CATÁLOGO DE VACUNAS
// ==========================================

const rutasCatalogoVacunas = require("./routes/vacunas");

app.use(
    "/api/catalogo-vacunas",
    rutasCatalogoVacunas
);

app.get("/vacunas", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "vacunas.html")
    );

});

// ==========================================
// SUBMÓDULO: ESQUEMA DE VACUNACIÓN
// ==========================================

const rutasEsquema = require("./routes/esquema");

app.use(
    "/api/esquema",
    rutasEsquema
);

app.get("/esquema", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "esquema.html")
    );

});

// ==========================================
// MÓDULO 6: DASHBOARD
// ==========================================

const rutasDashboard = require("./routes/dashboard");

app.use(
    "/api/dashboard",
    rutasDashboard
);

// ==========================================
// MÓDULO 7: ALERTAS DE VACUNACIÓN
// ==========================================

const rutasAlertas = require("./routes/alertas");

app.use(
    "/api/alertas",
    rutasAlertas
);

app.get("/alertas", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "alertas.html")
    );

});

// ==========================================
// MÓDULO 8: HISTORIAL DE ALERTAS
// ==========================================

const rutasHistorialAlertas = require(
    "./routes/historial-alertas"
);

app.use(
    "/api/historial-alertas",
    rutasHistorialAlertas
);

// ==========================================
// MÓDULO 9: CARNET DIGITAL ADMINISTRATIVO
// ==========================================

app.use(
    "/api/carnet",
    require("./routes/carnet")
);

app.get("/carnet", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "carnet.html")
    );

});

// ==========================================
// MÓDULO 10: NOTIFICACIONES WHATSAPP
// ==========================================

const rutasNotificaciones = require("./routes/notificaciones");

app.use(
    "/api/notificaciones",
    requiereRol("administrador"),
    rutasNotificaciones
);
// ==========================================
// VISTA: NOTIFICACIONES WHATSAPP
// ==========================================

app.get(
    "/notificaciones",
    requiereRol("administrador"),
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "views",
                "notificaciones.html"
            )
        );

    }
);

// ==========================================
// INICIAR SERVIDOR
// ==========================================
// ==========================================
// INICIAR SERVIDOR
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {

    console.log("==================================");
    console.log("SCCVI - SERVIDOR INICIADO");
    console.log(`PUERTO: ${PORT}`);
    console.log("ACCESO LOCAL: http://localhost:3000");
    console.log("SERVIDOR DISPONIBLE EN LA RED LOCAL");
    console.log("==================================");

});
