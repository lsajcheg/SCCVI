
require("dotenv").config();

const bcrypt = require("bcrypt");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const pool = require("../config/db");

async function crearAdministrador() {
    const rl = readline.createInterface({
        input: stdin,
        output: stdout
    });

    try {
        const nombres = (await rl.question("Nombres: ")).trim();
        const apellidos = (await rl.question("Apellidos: ")).trim();
        const correo = (await rl.question("Correo: "))
            .trim()
            .toLowerCase();

           const usuario = (await rl.question("Nombre de usuario: "))
    .trim()
    .toLowerCase();

if (!/^[a-z0-9._-]{4,50}$/.test(usuario)) {
    throw new Error(
        "El usuario debe tener entre 4 y 50 caracteres y solo puede contener letras minúsculas, números, puntos, guiones o guiones bajos"
    );
} 

        // La entrada se muestra en la terminal.
        // Utilizar una contraseña de prueba no reutilizada.
        const contrasena = await rl.question(
            "Contraseña (mínimo 12 caracteres): "
        );

        if (!nombres || !apellidos ||
            nombres.length > 100 ||
            apellidos.length > 100) {
            throw new Error("Nombres o apellidos no válidos");
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
            correo.length > 150) {
            throw new Error("Correo electrónico no válido");
        }

        if (contrasena.length < 12 ||
            Buffer.byteLength(contrasena, "utf8") > 72) {
            throw new Error(
                "La contraseña debe tener al menos 12 caracteres y no superar 72 bytes"
            );
        }

        const rol = await pool.query(`
            SELECT id_rol
            FROM roles
            WHERE nombre = 'administrador'
            LIMIT 1
        `);

        if (!rol.rowCount) {
            throw new Error("No existe el rol administrador");
        }

      const existente = await pool.query(`
    SELECT id_usuario
    FROM usuarios
    WHERE LOWER(correo) = $1
       OR LOWER(usuario) = $2
    LIMIT 1
`, [correo, usuario]);

if (existente.rowCount) {
    throw new Error(
        "El correo o nombre de usuario ya está registrado"
    );
}

        const hash = await bcrypt.hash(contrasena, 12);

        const resultado = await pool.query(`
    INSERT INTO usuarios (
        nombres,
        apellidos,
        usuario,
        correo,
        contrasena_hash,
        id_rol,
        estado
    )
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    RETURNING id_usuario, nombres, usuario, correo
`, [
    nombres,
    apellidos,
    usuario,
    correo,
    hash,
    rol.rows[0].id_rol
]);

        console.log("\nAdministrador creado correctamente:");
        console.log(resultado.rows[0]);

    } catch (error) {
        console.error("\nERROR:", error.message);
    } finally {
        rl.close();
        await pool.end();
    }
}

crearAdministrador();
