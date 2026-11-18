
const tabla = document.getElementById("tablaUsuarios");
const formulario = document.getElementById("formUsuario");
const panelFormulario = document.getElementById("panelFormulario");
const mensaje = document.getElementById("mensaje");

let usuarios = [];

function mostrarMensaje(texto, tipo = "success") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function crearCelda(fila, valor) {
    const celda = document.createElement("td");
    celda.textContent = valor ?? "";
    fila.appendChild(celda);
    return celda;
}

async function solicitar(url, opciones = {}) {
    const respuesta = await fetch(url, {
        credentials: "same-origin",
        ...opciones
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(datos.error || "Error en la solicitud");
    }

    return datos;
}

// CARGAR ROLES
async function cargarRoles() {
    const roles = await solicitar("/api/usuarios/roles");
    const selector = document.getElementById("idRol");

    selector.replaceChildren();

    const opcion = document.createElement("option");
    opcion.value = "";
    opcion.textContent = "Seleccione un rol";
    selector.appendChild(opcion);

    roles.forEach(rol => {
        const item = document.createElement("option");
        item.value = rol.id_rol;
        item.textContent = rol.nombre;
        selector.appendChild(item);
    });
}

// CARGAR USUARIOS
async function cargarUsuarios() {
    try {
        usuarios = await solicitar("/api/usuarios");
        tabla.replaceChildren();

        if (usuarios.length === 0) {
            const fila = document.createElement("tr");
            const celda = crearCelda(
                fila,
                "No hay usuarios registrados"
            );
            celda.colSpan = 7;
            celda.className = "text-center";
            tabla.appendChild(fila);
            return;
        }

        usuarios.forEach(usuario => {
            const fila = document.createElement("tr");

            crearCelda(fila, usuario.id_usuario);
            crearCelda(
                fila,
                `${usuario.nombres} ${usuario.apellidos}`
            );
            crearCelda(fila, usuario.usuario);
            crearCelda(fila, usuario.correo);
            crearCelda(fila, usuario.rol);

            const celdaEstado = crearCelda(
                fila,
                usuario.estado ? "Activo" : "Inactivo"
            );

            celdaEstado.className = usuario.estado
                ? "text-success fw-bold"
                : "text-danger fw-bold";

            const acciones = document.createElement("td");

            const editar = document.createElement("button");
            editar.textContent = "Editar";
            editar.className = "btn btn-sm btn-outline-primary me-2";
            editar.addEventListener("click", () => {
                editarUsuario(usuario.id_usuario);
            });

            const estado = document.createElement("button");
            estado.textContent = usuario.estado
                ? "Desactivar"
                : "Activar";

            estado.className = usuario.estado
                ? "btn btn-sm btn-outline-danger"
                : "btn btn-sm btn-outline-success";

            estado.addEventListener("click", () => {
                cambiarEstado(usuario);
            });

            acciones.append(editar, estado);
            fila.appendChild(acciones);
            tabla.appendChild(fila);
        });

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// NUEVO USUARIO
document.getElementById("btnNuevo").addEventListener(
    "click",
    () => {
        formulario.reset();

        document.getElementById("idUsuario").value = "";
        document.getElementById("tituloFormulario").textContent =
            "Registrar Usuario";

        document.getElementById("contrasena").required = true;

        document.getElementById("labelContrasena").textContent =
            "Contraseña";

        document.getElementById("ayudaContrasena").textContent =
            "Mínimo 8 caracteres.";

        panelFormulario.classList.remove("d-none");
    }
);

// EDITAR USUARIO
function editarUsuario(id) {
    const usuario = usuarios.find(
        item => Number(item.id_usuario) === Number(id)
    );

    if (!usuario) return;

    document.getElementById("idUsuario").value =
        usuario.id_usuario;

    document.getElementById("nombres").value =
        usuario.nombres;

    document.getElementById("apellidos").value =
        usuario.apellidos;

    document.getElementById("usuario").value =
        usuario.usuario;

    document.getElementById("correo").value =
        usuario.correo;

    document.getElementById("idRol").value =
        usuario.id_rol;

    document.getElementById("contrasena").value = "";
    document.getElementById("contrasena").required = false;

    document.getElementById("tituloFormulario").textContent =
        "Editar Usuario";

    document.getElementById("labelContrasena").textContent =
        "Nueva contraseña (opcional)";

    document.getElementById("ayudaContrasena").textContent =
        "Dejar en blanco para conservar la contraseña actual.";

    panelFormulario.classList.remove("d-none");
    panelFormulario.scrollIntoView({ behavior: "smooth" });
}

// GUARDAR
formulario.addEventListener("submit", async evento => {
    evento.preventDefault();

    const id = document.getElementById("idUsuario").value;

    const datos = {
        nombres: document.getElementById("nombres").value,
        apellidos: document.getElementById("apellidos").value,
        usuario: document.getElementById("usuario").value,
        correo: document.getElementById("correo").value,
        id_rol: document.getElementById("idRol").value,
        contrasena: document.getElementById("contrasena").value
    };

    const boton = document.getElementById("btnGuardar");
    boton.disabled = true;

    try {
        await solicitar(
            id ? `/api/usuarios/${id}` : "/api/usuarios",
            {
                method: id ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(datos)
            }
        );

        mostrarMensaje(
            id
                ? "Usuario actualizado correctamente"
                : "Usuario registrado correctamente"
        );

        formulario.reset();
        panelFormulario.classList.add("d-none");

        await cargarUsuarios();

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    } finally {
        boton.disabled = false;
    }
});

// CAMBIAR ESTADO
async function cambiarEstado(usuario) {
    const nuevoEstado = !usuario.estado;

    const accion = nuevoEstado ? "activar" : "desactivar";

    if (!confirm(
        `¿Desea ${accion} al usuario ${usuario.usuario}?`
    )) {
        return;
    }

    try {
        await solicitar(
            `/api/usuarios/${usuario.id_usuario}/estado`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    estado: nuevoEstado
                })
            }
        );

        mostrarMensaje("Estado actualizado correctamente");
        await cargarUsuarios();

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// CANCELAR
document.getElementById("btnCancelar").addEventListener(
    "click",
    () => {
        formulario.reset();
        panelFormulario.classList.add("d-none");
    }
);

// INICIAR
(async () => {
    try {
        await cargarRoles();
        await cargarUsuarios();
    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
})();
