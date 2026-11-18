

const API_PADRES = "/api/padres";
const API_COMUNIDADES = "/api/comunidades";

const formPadre = document.getElementById("formPadre");
const tablaPadres = document.getElementById("tablaPadres");
const mensaje = document.getElementById("mensaje");

let padres = [];

// ==========================================
// CONTROL DE PERMISOS
// ==========================================
let rolUsuario = "";
let puedeRegistrar = false;
let puedeEditar = false;
let puedeEliminar = false;

// ==========================================
// MOSTRAR MENSAJES
// ==========================================
function mostrarMensaje(texto, tipo = "success") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

// ==========================================
// VERIFICAR PERMISOS DEL USUARIO
// ==========================================
async function verificarPermisos() {
    const respuesta = await fetch("/api/auth/sesion", {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (respuesta.status === 401) {
        window.top.location.replace("/login");
        throw new Error("Sesión finalizada");
    }

    if (!respuesta.ok) {
        throw new Error("No se pudo verificar la sesión");
    }

    const datos = await respuesta.json();

    rolUsuario = datos.usuario.rol;

    puedeRegistrar = [
        "administrador",
        "medico",
        "enfermero"
    ].includes(rolUsuario);

    puedeEditar = puedeRegistrar;

    puedeEliminar = rolUsuario === "administrador";

    // Ocultar el formulario al encargado
    if (!puedeRegistrar) {
        formPadre.style.display = "none";

        // Ocultar la tarjeta completa si el formulario
        // está dentro de una tarjeta independiente.
        const tarjetaFormulario = formPadre.closest(".card");

        if (tarjetaFormulario) {
            tarjetaFormulario.style.display = "none";
        }
    }
}

// ==========================================
// LIMPIAR FORMULARIO
// ==========================================
function limpiarFormulario() {
    formPadre.reset();
    document.getElementById("id_padre").value = "";
}

// ==========================================
// CARGAR COMUNIDADES
// ==========================================
async function cargarComunidades() {
    try {
        const respuesta = await fetch(API_COMUNIDADES);

        if (!respuesta.ok) {
            throw new Error("Error al cargar comunidades");
        }

        const comunidades = await respuesta.json();
        const select = document.getElementById("id_comunidad");

        select.replaceChildren(
            new Option("Seleccione comunidad", "")
        );

        comunidades.forEach(c => {
            select.add(
                new Option(c.nombre, c.id_comunidad)
            );
        });

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// CARGAR PADRES
// ==========================================
async function cargarPadres() {
    try {
        const respuesta = await fetch(API_PADRES);

        if (!respuesta.ok) {
            throw new Error("Error al cargar padres");
        }

        padres = await respuesta.json();
        tablaPadres.replaceChildren();

        padres.forEach(p => {
            const fila = document.createElement("tr");

            const datos = [
                p.id_padre,
                `${p.nombres} ${p.apellidos}`,
                p.dpi ?? "",
                p.telefono ?? "",
                p.comunidad ?? ""
            ];

            datos.forEach(valor => {
                const celda = document.createElement("td");
                celda.textContent = valor;
                fila.appendChild(celda);
            });

            // ==================================
            // BOTONES SEGÚN PERMISOS
            // ==================================
            const acciones = document.createElement("td");

            // ADMINISTRADOR, MÉDICO Y ENFERMERO
            if (puedeEditar) {
                const editar = document.createElement("button");

                editar.textContent = "Editar";
                editar.className =
                    "btn btn-warning btn-sm me-2";

                editar.onclick = () =>
                    editarPadre(p.id_padre);

                acciones.appendChild(editar);
            }

            // SOLO ADMINISTRADOR
            if (puedeEliminar) {
                const eliminar = document.createElement("button");

                eliminar.textContent = "Eliminar";
                eliminar.className =
                    "btn btn-danger btn-sm";

                eliminar.onclick = () =>
                    eliminarPadre(p.id_padre);

                acciones.appendChild(eliminar);
            }

            // ENCARGADO
            if (!puedeEditar && !puedeEliminar) {
                acciones.textContent = "Solo consulta";
            }

            fila.appendChild(acciones);
            tablaPadres.appendChild(fila);
        });

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// REGISTRAR O ACTUALIZAR PADRE
// ==========================================
formPadre.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (!puedeRegistrar) {
        mostrarMensaje(
            "No tiene permisos para registrar o modificar padres",
            "danger"
        );
        return;
    }

    const id = document.getElementById("id_padre").value;

    const campos = [
        "nombres",
        "apellidos",
        "dpi",
        "telefono",
        "correo",
        "canal_notificacion",
        "id_comunidad"
    ];

    const datos = {};

    campos.forEach(campo => {
        datos[campo] =
            document.getElementById(campo).value.trim();
    });

    try {
        const respuesta = await fetch(
            id ? `${API_PADRES}/${id}` : API_PADRES,
            {
                method: id ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(datos)
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "Error al guardar"
            );
        }

        limpiarFormulario();

        mostrarMensaje(
            id
                ? "Padre actualizado correctamente"
                : "Padre registrado correctamente"
        );

        await cargarPadres();

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
});

// ==========================================
// EDITAR PADRE
// ==========================================
function editarPadre(id) {
    if (!puedeEditar) {
        mostrarMensaje(
            "No tiene permisos para modificar padres",
            "danger"
        );
        return;
    }

    const p = padres.find(
        p => p.id_padre === id
    );

    if (!p) return;

    document.getElementById("id_padre").value =
        p.id_padre;

    [
        "nombres",
        "apellidos",
        "dpi",
        "telefono",
        "correo",
        "canal_notificacion",
        "id_comunidad"
    ].forEach(campo => {
        document.getElementById(campo).value =
            p[campo] ?? "";
    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ==========================================
// ELIMINAR PADRE
// ==========================================
async function eliminarPadre(id) {
    if (!puedeEliminar) {
        mostrarMensaje(
            "No tiene permisos para eliminar padres",
            "danger"
        );
        return;
    }

    if (!confirm("¿Deseas eliminar este registro?")) {
        return;
    }

    try {
        const respuesta = await fetch(
            `${API_PADRES}/${id}`,
            {
                method: "DELETE"
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "Error al eliminar"
            );
        }

        mostrarMensaje(resultado.mensaje);

        await cargarPadres();

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// INICIAR MÓDULO
// ==========================================
async function iniciar() {
    try {
        // Primero verificamos el rol
        await verificarPermisos();

        // Después cargamos la información
        await cargarComunidades();
        await cargarPadres();

    } catch (error) {
        console.error("ERROR INICIO PADRES:", error);
        mostrarMensaje(error.message, "danger");
    }
}

iniciar();
