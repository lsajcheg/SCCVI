
const API = "/api/crecimiento";

const form = document.getElementById("formCrecimiento");
const tabla = document.getElementById("tablaCrecimiento");
const mensaje = document.getElementById("mensaje");
const selector = document.getElementById("id_nino");

const FACTOR_LIBRAS_KG = 0.45359237;

const campoPeso = document.getElementById("peso_kg");
const unidadPeso = document.getElementById("unidad_peso");
const pesoConvertido = document.getElementById("peso_convertido");

let ninos = [];
let mediciones = [];

let graficaPeso = null;
let graficaTalla = null;
let graficaIMC = null;

let claveGraficaTalla = null;
let solicitudGraficaTalla = 0;

// ==========================================
// PERMISOS DEL USUARIO
// ==========================================
let rolUsuario = "";
let puedeRegistrar = false;
let puedeEditar = false;
let puedeEliminar = false;

// ==========================================
// VERIFICAR PERMISOS
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

    // El encargado únicamente puede consultar.
    if (!puedeRegistrar) {
        // Conservamos visible el selector de niños
        // para consultar historiales y gráficas.
        const tarjeta = form.closest(".card");

        if (tarjeta && !tarjeta.contains(
            document.getElementById("graficaPeso")
        )) {
            // No ocultamos la tarjeta completa porque
            // podría contener el selector de niños.
        }

        // Deshabilitar los campos de registro,
        // excepto el selector utilizado para consultas.
        form.querySelectorAll("input, textarea, select, button")
            .forEach(elemento => {
                if (elemento !== selector) {
                    elemento.disabled = true;
                }
            });

        // Ocultar los controles de edición.
        form.querySelectorAll("button[type='submit']")
            .forEach(boton => {
                boton.style.display = "none";
            });
    }
}

// ==========================================
// MOSTRAR MENSAJES
// ==========================================
function mostrarMensaje(texto, tipo = "success") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

// ==========================================
// CREAR CELDAS
// ==========================================
function crearCelda(fila, texto) {
    const celda = document.createElement("td");
    celda.textContent = texto ?? "";
    fila.appendChild(celda);
    return celda;
}

// ==========================================
// CONVERTIR PESO A KILOGRAMOS
// ==========================================
function convertirAKg(peso, unidad) {
    const valor = Number(peso);

    if (!Number.isFinite(valor) || valor <= 0) {
        return null;
    }

    return unidad === "lb"
        ? valor * FACTOR_LIBRAS_KG
        : valor;
}

// ==========================================
// MOSTRAR CONVERSIÓN DE PESO
// ==========================================
function actualizarConversion() {
    if (campoPeso.value === "") {
        pesoConvertido.textContent =
            "Peso almacenado en kilogramos.";
        return;
    }

    const kg = convertirAKg(
        campoPeso.value,
        unidadPeso.value
    );

    if (kg === null) {
        pesoConvertido.textContent =
            "Ingrese un peso válido.";
        return;
    }

    pesoConvertido.textContent =
        `Equivalente: ${kg.toFixed(2)} kg`;
}

campoPeso.addEventListener("input", actualizarConversion);
unidadPeso.addEventListener("change", actualizarConversion);

// ==========================================
// FORMATO DE FECHA
// ==========================================
function fechaISO(valor) {
    if (!valor) return "";

    return String(valor).slice(0, 10);
}

// ==========================================
// CALCULAR EDAD EN MESES
// ==========================================
function calcularEdad(nacimiento, medicion) {
    const [an, mn, dn] = fechaISO(nacimiento)
        .split("-").map(Number);

    const [am, mm, dm] = fechaISO(medicion)
        .split("-").map(Number);

    if (!an || !am) return null;

    let meses = (am - an) * 12 + mm - mn;

    if (dm < dn) {
        meses--;
    }

    return Math.max(0, meses);
}

// ==========================================
// ACTUALIZAR EDAD
// ==========================================
function actualizarEdad() {
    const nino = ninos.find(
        n => n.id_nino === Number(selector.value)
    );

    const fecha =
        document.getElementById("fecha_medicion").value;

    const campo = document.getElementById("edad");

    if (!nino || !fecha) {
        campo.value = "";
        return;
    }

    if (fecha < fechaISO(nino.fecha_nacimiento)) {
        campo.value = "Fecha anterior al nacimiento";
        return;
    }

    const meses = calcularEdad(
        nino.fecha_nacimiento,
        fecha
    );

    campo.value = `${meses} meses completos`;
}

// ==========================================
// CARGAR NIÑOS
// ==========================================
async function cargarNinos() {
    const respuesta = await fetch("/api/ninos");

    if (!respuesta.ok) {
        throw new Error(
            "No se pudieron cargar los niños"
        );
    }

    ninos = await respuesta.json();

    selector.replaceChildren(
        new Option("Seleccione niño", "")
    );

    ninos.forEach(n => {
        selector.add(
            new Option(
                `${n.nombres} ${n.apellidos} (ID ${n.id_nino})`,
                n.id_nino
            )
        );
    });
}

// ==========================================
// CARGAR MEDICIONES
// ==========================================
async function cargarMediciones() {
    const respuesta = await fetch(API);

    if (!respuesta.ok) {
        throw new Error(
            "No se pudo cargar el historial"
        );
    }

    mediciones = await respuesta.json();

    mostrarHistorial();
    actualizarGraficas();
}

// ==========================================
// MOSTRAR EVALUACIÓN OMS
// ==========================================

/*
function mostrarEvaluacionOMS() {
    const mensajeOMS = document.getElementById("mensajeOMS");
    const resultadosOMS = document.getElementById("resultadosOMS");

    if (!mensajeOMS || !resultadosOMS) return;

    resultadosOMS.style.display = "none";

    // No seleccionar automáticamente ningún niño
    if (!selector.value) {
        mensajeOMS.textContent =
            "Seleccione un niño para consultar su evaluación.";
        return;
    }

    // Obtener las mediciones del niño seleccionado
    const registros = mediciones
        .filter(m => m.id_nino === Number(selector.value))
        .sort((a, b) =>
            fechaISO(b.fecha_medicion).localeCompare(
                fechaISO(a.fecha_medicion)
            ) || Number(b.id_registro) - Number(a.id_registro)
        );

    if (registros.length === 0) {
        mensajeOMS.textContent =
            "El niño seleccionado no tiene mediciones registradas.";
        return;
    }

    // Utilizar la medición más reciente
    const medicion = registros[0];
    const oms = medicion.oms_imc;

    // ==========================================
    // MOSTRAR IMC
    // ==========================================
    document.getElementById("valorIMC").textContent =
        medicion.imc == null
            ? "--"
            : Number(medicion.imc).toFixed(2);

    // ==========================================
    // VALIDAR RESULTADOS OMS
    // ==========================================
    const referenciaDisponible =
        oms?.disponible === true &&
        oms.z != null &&
        Number.isFinite(Number(oms.z));

    const z = referenciaDisponible
        ? Number(oms.z)
        : null;

    const percentilValido =
        oms?.percentil != null &&
        Number.isFinite(Number(oms.percentil));

    // ==========================================
    // MOSTRAR PUNTUACIÓN Z
    // ==========================================
    document.getElementById("valorZ").textContent =
        z === null
            ? "No disponible"
            : (z > 0 ? "+" : "") + z.toFixed(2);

    // ==========================================
    // MOSTRAR PERCENTIL
    // ==========================================
    document.getElementById("valorPercentil").textContent =
        !referenciaDisponible || !percentilValido
            ? "No disponible"
            : Number(oms.percentil).toFixed(2);

    // ==========================================
    // MENSAJE INFORMATIVO
    // ==========================================
    if (!referenciaDisponible) {
        mensajeOMS.textContent =
            "Última medición: " +
            fechaISO(medicion.fecha_medicion) +
            ". No existe referencia OMS disponible para esta edad.";
    } else {
        mensajeOMS.textContent =
            "Última medición: " +
            fechaISO(medicion.fecha_medicion) +
            ". Referencia OMS 2007 de IMC para la edad. " +
            "Resultados en proceso de validación clínica.";
    }

    // Mostrar resultados
    resultadosOMS.style.display = "";
}

*/


function mostrarEvaluacionOMS() {

    const mensajeOMS =
        document.getElementById("mensajeOMS");

    const resultadosOMS =
        document.getElementById("resultadosOMS");

    if (!mensajeOMS || !resultadosOMS) return;

    resultadosOMS.style.display = "none";

    // ==========================================
    // NO SELECCIONAR NIÑO AUTOMÁTICAMENTE
    // ==========================================
    if (!selector.value) {
        mensajeOMS.textContent =
            "Seleccione un niño para consultar su evaluación.";
        return;
    }

    // ==========================================
    // OBTENER MEDICIONES DEL NIÑO
    // ==========================================
    const registros = mediciones
        .filter(
            m => Number(m.id_nino) === Number(selector.value)
        )
        .sort((a, b) =>
            fechaISO(b.fecha_medicion).localeCompare(
                fechaISO(a.fecha_medicion)
            ) ||
            Number(b.id_registro) - Number(a.id_registro)
        );

    if (registros.length === 0) {
        mensajeOMS.textContent =
            "El niño seleccionado no tiene mediciones registradas.";
        return;
    }

    // Última medición registrada
    const medicion = registros[0];

    const omsIMC = medicion.oms_imc;
    const omsTalla = medicion.oms_talla;

    // ==========================================
    // FUNCIÓN PARA FORMATEAR PUNTUACIÓN Z
    // ==========================================
    function formatearZ(oms) {
        if (
            oms?.disponible !== true ||
            oms.z == null ||
            !Number.isFinite(Number(oms.z))
        ) {
            return "No disponible";
        }

        const z = Number(oms.z);

        return (z > 0 ? "+" : "") + z.toFixed(2);
    }

    // ==========================================
    // FUNCIÓN PARA FORMATEAR PERCENTIL
    // ==========================================
    function formatearPercentil(oms) {
        if (
            oms?.disponible !== true ||
            oms.percentil == null ||
            !Number.isFinite(Number(oms.percentil))
        ) {
            return "No disponible";
        }

        return Number(oms.percentil).toFixed(2);
    }

    // ==========================================
    // EVALUACIÓN IMC PARA LA EDAD
    // ==========================================
    document.getElementById("valorIMC").textContent =
        medicion.imc == null
            ? "--"
            : Number(medicion.imc).toFixed(2);

    document.getElementById("valorZ").textContent =
        formatearZ(omsIMC);

    document.getElementById("valorPercentil").textContent =
        formatearPercentil(omsIMC);

    // ==========================================
    // EVALUACIÓN TALLA PARA LA EDAD
    // ==========================================
    document.getElementById("valorTallaOMS").textContent =
        medicion.talla_cm == null
            ? "--"
            : Number(medicion.talla_cm).toFixed(2);

    document.getElementById("valorZTalla").textContent =
        formatearZ(omsTalla);

    document.getElementById("valorPercentilTalla").textContent =
        formatearPercentil(omsTalla);

    // ==========================================
    // MENSAJE DE REFERENCIAS OMS
    // ==========================================
    const imcDisponible =
        omsIMC?.disponible === true;

    const tallaDisponible =
        omsTalla?.disponible === true;

    const fecha = fechaISO(medicion.fecha_medicion);

    if (imcDisponible && tallaDisponible) {
        mensajeOMS.textContent =
            `Última medición: ${fecha}. ` +
            "Evaluación de IMC y talla para la edad " +
            "según referencias OMS 2007. " +
            "Resultados pendientes de validación clínica.";

    } else if (imcDisponible || tallaDisponible) {
        mensajeOMS.textContent =
            `Última medición: ${fecha}. ` +
            "Algunos indicadores OMS no están disponibles " +
            "para la edad registrada.";

    } else {
        mensajeOMS.textContent =
            `Última medición: ${fecha}. ` +
            "No existen referencias OMS disponibles " +
            "para esta edad.";
    }

    // ==========================================
    // MOSTRAR RESULTADOS
    // ==========================================
    resultadosOMS.style.display = "";
}





// ==========================================
// MOSTRAR HISTORIAL
// ==========================================
function mostrarHistorial() {
    tabla.replaceChildren();

    const filtradas = mediciones.filter(m =>
        !selector.value ||
        m.id_nino === Number(selector.value)
    );

    filtradas.forEach(m => {
        const fila = document.createElement("tr");

        crearCelda(
            fila,
            `${m.nombres} ${m.apellidos}`
        );

        crearCelda(
            fila,
            fechaISO(m.fecha_medicion)
        );

        crearCelda(
            fila,
            calcularEdad(
                m.fecha_nacimiento,
                m.fecha_medicion
            )
        );

        crearCelda(fila, m.peso_kg);
        crearCelda(fila, m.talla_cm);

        // ==================================
        // BOTONES SEGÚN PERMISOS
        // ==================================
        const acciones = document.createElement("td");

        // ADMINISTRADOR, MÉDICO Y ENFERMERO
        if (puedeEditar) {
            const editar =
                document.createElement("button");

            editar.textContent = "Editar";
            editar.className =
                "btn btn-warning btn-sm me-2";

            editar.onclick = () =>
                editarMedicion(m.id_registro);

            acciones.appendChild(editar);
        }

        // SOLO ADMINISTRADOR
        if (puedeEliminar) {
            const eliminar =
                document.createElement("button");

            eliminar.textContent = "Eliminar";
            eliminar.className =
                "btn btn-danger btn-sm";

            eliminar.onclick = () =>
                eliminarMedicion(m.id_registro);

            acciones.appendChild(eliminar);
        }

        // ENCARGADO
        if (!puedeEditar && !puedeEliminar) {
            acciones.textContent = "Solo consulta";
        }

        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

// ==========================================
// LIMPIAR FORMULARIO
// ==========================================
function limpiarFormulario() {
    const ninoSeleccionado = selector.value;

    form.reset();

    selector.value = ninoSeleccionado;

    document.getElementById("id_registro").value = "";
    document.getElementById("edad").value = "";

    unidadPeso.value = "kg";

    actualizarConversion();
    actualizarEdad();
    mostrarHistorial();
    actualizarGraficas();
    mostrarEvaluacionOMS();
}

// ==========================================
// REGISTRAR O ACTUALIZAR MEDICIÓN
// ==========================================
form.addEventListener("submit", async evento => {
    evento.preventDefault();

    if (!puedeRegistrar) {
        mostrarMensaje(
            "No tiene permisos para registrar o modificar mediciones",
            "danger"
        );
        return;
    }

    const id =
        document.getElementById("id_registro").value;

    const pesoKg = convertirAKg(
        campoPeso.value,
        unidadPeso.value
    );

    if (
        pesoKg === null ||
        pesoKg <= 0 ||
        pesoKg >= 1000
    ) {
        mostrarMensaje(
            "Ingrese un peso válido",
            "warning"
        );
        return;
    }

    const datos = {
        id_nino: selector.value,

        fecha_medicion:
            document.getElementById(
                "fecha_medicion"
            ).value,

        // Siempre enviamos el peso en kilogramos.
        peso_kg: Number(pesoKg.toFixed(2)),

        talla_cm:
            document.getElementById(
                "talla_cm"
            ).value,

        observaciones:
            document.getElementById(
                "observaciones"
            ).value.trim()
    };

    try {
        const respuesta = await fetch(
            id ? `${API}/${id}` : API,
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

        await cargarMediciones();

        mostrarMensaje(
            resultado.mensaje ||
            "Medición guardada correctamente"
        );

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
});

// ==========================================
// EDITAR MEDICIÓN
// ==========================================
function editarMedicion(id) {
    if (!puedeEditar) {
        mostrarMensaje(
            "No tiene permisos para modificar mediciones",
            "danger"
        );
        return;
    }

    const m = mediciones.find(
        m => m.id_registro === id
    );

    if (!m) return;

    document.getElementById("id_registro").value =
        m.id_registro;

    selector.value = m.id_nino;

    document.getElementById("fecha_medicion").value =
        fechaISO(m.fecha_medicion);

    campoPeso.value = m.peso_kg;

    // Los pesos se almacenan en kilogramos.
    unidadPeso.value = "kg";

    actualizarConversion();

    document.getElementById("talla_cm").value =
        m.talla_cm;

    document.getElementById("observaciones").value =
        m.observaciones ?? "";

    actualizarEdad();
    mostrarHistorial();
    actualizarGraficas();
    mostrarEvaluacionOMS();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ==========================================
// ELIMINAR MEDICIÓN
// ==========================================
async function eliminarMedicion(id) {
    if (!puedeEliminar) {
        mostrarMensaje(
            "No tiene permisos para eliminar mediciones",
            "danger"
        );
        return;
    }

    if (!confirm("¿Deseas eliminar esta medición?")) {
        return;
    }

    try {
        const respuesta = await fetch(
            `${API}/${id}`,
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

        await cargarMediciones();

        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}


// ==========================================
// GRÁFICA IMC PARA LA EDAD - OMS 2007
// ==========================================

/* ==========================================
   GRÁFICAS OMS 2007: IMC Y TALLA
========================================== */

let solicitudGraficaIMC = 0;
let claveGraficaIMC = null;

// Destruir la gráfica correspondiente
function eliminarGraficaOMS(tipo) {
    if (tipo === "imc") {
        if (graficaIMC) {
            graficaIMC.destroy();
        }

        graficaIMC = null;
        claveGraficaIMC = null;

    } else {
        if (graficaTalla) {
            graficaTalla.destroy();
        }

        graficaTalla = null;
        claveGraficaTalla = null;
    }
}

// ==========================================
// DIBUJAR CURVAS OMS
// ==========================================
async function dibujarGraficaOMS(tipo) {

    const esIMC = tipo === "imc";

    // Identificar cada solicitud
    const solicitudActual = esIMC
        ? ++solicitudGraficaIMC
        : ++solicitudGraficaTalla;

    const vigente = () => esIMC
        ? solicitudActual === solicitudGraficaIMC
        : solicitudActual === solicitudGraficaTalla;

    const canvas = document.getElementById(
        esIMC ? "graficaIMC" : "graficaTalla"
    );

    const idNino = Number(selector.value);

    // No seleccionar automáticamente ningún niño
    if (!canvas || !selector.value) {
        eliminarGraficaOMS(tipo);
        return;
    }

    const nino = ninos.find(
        n => Number(n.id_nino) === idNino
    );

    const sexo = String(nino?.sexo || "").toUpperCase();

    if (!["M", "F"].includes(sexo)) {
        eliminarGraficaOMS(tipo);
        return;
    }

    // ==========================================
    // MEDICIONES DEL NIÑO
    // ==========================================
    const registros = mediciones
        .filter(m => Number(m.id_nino) === idNino)
        .sort((a, b) =>
            Number(a.edad_meses) - Number(b.edad_meses)
        );

    const puntos = registros
        .map(m => ({
            x: Number(m.edad_meses),
            y: Number(esIMC ? m.imc : m.talla_cm)
        }))
        .filter(p =>
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            p.y > 0
        );

    // ==========================================
    // EVITAR REDIBUJOS INNECESARIOS
    // ==========================================
    const clave = JSON.stringify({
        idNino,
        sexo,
        puntos
    });

    const graficaActual = esIMC
        ? graficaIMC
        : graficaTalla;

    const claveAnterior = esIMC
        ? claveGraficaIMC
        : claveGraficaTalla;

    if (
        graficaActual &&
        claveAnterior === clave
    ) {
        return;
    }

    // ==========================================
    // CONSULTAR REFERENCIAS OMS
    // ==========================================
    const ruta = esIMC
        ? "curvas-imc"
        : "curvas-talla";

    const respuesta = await fetch(
        `/api/crecimiento/oms/${ruta}?sexo=${encodeURIComponent(sexo)}`
    );

    if (!respuesta.ok) {
        throw new Error(
            `No se pudieron cargar las curvas OMS de ${tipo}`
        );
    }

    const datos = await respuesta.json();

    // Ignorar respuestas anteriores si cambió el niño
    if (
        !vigente() ||
        Number(selector.value) !== idNino
    ) {
        return;
    }

    const curvas = Array.isArray(datos.curvas)
        ? datos.curvas
        : [];

    // ==========================================
    // CURVAS DE REFERENCIA OMS
    // ==========================================
    const definiciones = [
        ["z_menos_3", "-3 DE", "#dc3545"],
        ["z_menos_2", "-2 DE", "#fd7e14"],
        ["z_menos_1", "-1 DE", "#ffc107"],
        ["mediana", "Mediana OMS", "#198754"],
        ["z_mas_1", "+1 DE", "#ffc107"],
        ["z_mas_2", "+2 DE", "#fd7e14"],
        ["z_mas_3", "+3 DE", "#dc3545"]
    ];

    const datasets = definiciones.map(
        ([campo, etiqueta, color]) => ({
            label: etiqueta,

            data: curvas.map(c => ({
                x: Number(c.edad_meses),
                y: c[campo] == null
                    ? null
                    : Number(c[campo])
            })),

            borderColor: color,
            backgroundColor: color,

            borderWidth:
                campo === "mediana" ? 3 : 1.5,

            pointRadius: 0,
            tension: 0.15
        })
    );

    // ==========================================
    // MEDICIONES REALES
    // ==========================================
    datasets.push({
        label: "Mediciones del niño",
        data: puntos,

        borderColor: "#0d6efd",
        backgroundColor: "#0d6efd",

        borderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 8,

        showLine: puntos.length > 1,
        tension: 0.2
    });

    // Destruir únicamente la gráfica anterior
    eliminarGraficaOMS(tipo);

    // ==========================================
    // CREAR GRÁFICA FIJA
    // ==========================================
    const grafica = new Chart(canvas, {
        type: "line",

        data: {
            datasets
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            // Desactivar animaciones
            animation: false,

            parsing: false,

            interaction: {
                mode: "nearest",
                intersect: false
            },

            plugins: {
                legend: {
                    position: "bottom"
                },

                tooltip: {
                    callbacks: {
                        title: items =>
                            items.length
                                ? `Edad: ${items[0].parsed.x} meses`
                                : ""
                    }
                }
            },

            scales: {
                x: {
                    type: "linear",
                    min: 61,
                    max: 228,

                    title: {
                        display: true,
                        text: "Edad (meses)"
                    },

                    ticks: {
                        precision: 0
                    }
                },

                y: {
                    title: {
                        display: true,
                        text: esIMC
                            ? "IMC (kg/m²)"
                            : "Talla (cm)"
                    }
                }
            }
        }
    });

    // Guardar la instancia correspondiente
    if (esIMC) {
        graficaIMC = grafica;
        claveGraficaIMC = clave;

    } else {
        graficaTalla = grafica;
        claveGraficaTalla = clave;
    }
}

// ==========================================
// GRÁFICA IMC
// ==========================================
async function actualizarGraficaIMC() {
    return dibujarGraficaOMS("imc");
}

// ==========================================
// GRÁFICA TALLA
// ==========================================
async function actualizarGraficaTallaOMS() {
    return dibujarGraficaOMS("talla");
}


 // ==========================================
 // GRÁFICA PESO PARA LA EDAD - OMS 2007
 // ==========================================

 let solicitudGraficaPeso = 0;
 let claveGraficaPeso = null;

 function eliminarGraficaPeso() {
     if (graficaPeso) {
         graficaPeso.destroy();
         graficaPeso = null;
     }

     claveGraficaPeso = null;
 }

 
async function actualizarGraficaPesoOMS() {

    const solicitudActual = ++solicitudGraficaPeso;
    const canvas = document.getElementById("graficaPeso");

    // No seleccionar automáticamente ningún niño.
    if (!canvas || !selector.value) {
        eliminarGraficaPeso();
        return;
    }

    const idNino = Number(selector.value);

    const nino = ninos.find(
        n => Number(n.id_nino) === idNino
    );

    const sexo = String(nino?.sexo || "")
        .trim()
        .toUpperCase();

    // ==========================================
    // OBTENER MEDICIONES
    // ==========================================
    const registros = mediciones
        .filter(m => Number(m.id_nino) === idNino)
        .sort((a, b) =>
            Number(a.edad_meses) - Number(b.edad_meses)
        );

    const puntos = registros
        .map(m => ({
            x: Number(m.edad_meses),
            y: Number(m.peso_kg)
        }))
        .filter(p =>
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            p.x >= 0 &&
            p.y > 0
        );

    const clave = JSON.stringify({
        idNino,
        sexo,
        puntos
    });

    // Evitar actualizar si no cambiaron los datos.
    if (graficaPeso && claveGraficaPeso === clave) {
        return;
    }

    // ==========================================
    // CONSULTAR REFERENCIAS OMS
    // ==========================================
    const sexoValido = ["M", "F"].includes(sexo);

    const hayMedicionesEnRango = puntos.some(
        p => p.x >= 61 && p.x <= 120
    );

    let curvas = [];

    if (sexoValido && hayMedicionesEnRango) {

        const respuesta = await fetch(
            `/api/crecimiento/oms/curvas-peso?sexo=${encodeURIComponent(sexo)}`
        );

        if (!respuesta.ok) {
            throw new Error(
                "No se pudieron cargar las curvas OMS de peso"
            );
        }

        const datos = await respuesta.json();

        if (
            solicitudActual !== solicitudGraficaPeso ||
            Number(selector.value) !== idNino
        ) {
            return;
        }

        curvas = Array.isArray(datos.curvas)
            ? datos.curvas
            : [];
    }

    if (
        solicitudActual !== solicitudGraficaPeso ||
        Number(selector.value) !== idNino
    ) {
        return;
    }

    // ==========================================
    // PREPARAR CURVAS OMS
    // ==========================================
    const definiciones = [
        ["z_menos_3", "-3 DE", "#dc3545"],
        ["z_menos_2", "-2 DE", "#fd7e14"],
        ["z_menos_1", "-1 DE", "#ffc107"],
        ["mediana", "Mediana OMS", "#198754"],
        ["z_mas_1", "+1 DE", "#ffc107"],
        ["z_mas_2", "+2 DE", "#fd7e14"],
        ["z_mas_3", "+3 DE", "#dc3545"]
    ];

    const datasets = curvas.length
        ? definiciones.map(([campo, etiqueta, color]) => ({
            label: etiqueta,

            data: curvas.map(c => ({
                x: Number(c.edad_meses),
                y: c[campo] == null
                    ? null
                    : Number(c[campo])
            })),

            borderColor: color,
            backgroundColor: color,
            borderWidth: campo === "mediana" ? 3 : 1.5,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            fill: false
        }))
        : [];

    // ==========================================
    // MEDICIONES DEL NIÑO
    // ==========================================
    datasets.push({
        label: "Mediciones del niño",
        data: puntos,
        borderColor: "#0d6efd",
        backgroundColor: "#0d6efd",
        borderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 6,
        showLine: puntos.length > 1,
        tension: 0,
        fill: false
    });

    const edades = puntos.map(p => p.x);

    const edadMaxima = edades.length
        ? Math.max(...edades)
        : 120;

    const mostrarReferencias = curvas.length > 0;

    // ==========================================
    // CONFIGURACIÓN FIJA DE LOS EJES
    // ==========================================
    const minimoX = mostrarReferencias
        ? Math.min(61, ...(edades.length ? edades : [61]))
        : edades.length
            ? Math.max(0, Math.min(...edades) - 1)
            : 0;

    const maximoX = mostrarReferencias
        ? Math.max(120, edadMaxima)
        : Math.max(minimoX + 1, edadMaxima + 1);

    const opciones = {
        responsive: true,
        maintainAspectRatio: false,

        // Desactivar todas las animaciones.
        animation: false,
        animations: false,

        parsing: false,

        interaction: {
            mode: "nearest",
            intersect: false
        },

        plugins: {
            legend: {
                position: "bottom"
            },

            tooltip: {
                callbacks: {
                    title: items =>
                        items.length
                            ? `Edad: ${items[0].parsed.x} meses`
                            : ""
                }
            }
        },

        scales: {
            x: {
                type: "linear",
                min: minimoX,
                max: maximoX,

                title: {
                    display: true,
                    text: "Edad (meses)"
                },

                ticks: {
                    precision: 0
                }
            },

            y: {
                title: {
                    display: true,
                    text: "Peso (kg)"
                }
            }
        }
    };

    // ==========================================
    // ACTUALIZAR SIN DESTRUIR LA GRÁFICA
    // ==========================================
    if (graficaPeso) {

        graficaPeso.data.datasets = datasets;

        graficaPeso.options.scales.x.min = minimoX;
        graficaPeso.options.scales.x.max = maximoX;

        graficaPeso.update("none");

        claveGraficaPeso = clave;
        return;
    }

    // ==========================================
    // CREAR GRÁFICA UNA SOLA VEZ
    // ==========================================
    graficaPeso = new Chart(canvas, {
        type: "line",
        data: {
            datasets
        },
        options: opciones
    });

    claveGraficaPeso = clave;
}




// ==========================================
// ACTUALIZAR GRÁFICAS
// ==========================================

// ==========================================
// ACTUALIZAR GRÁFICAS
// ==========================================
function actualizarGraficas() {

    // ==========================================
    // GRÁFICA PESO PARA LA EDAD - OMS 2007
    // ==========================================
    actualizarGraficaPesoOMS().catch(error => {
        console.error("ERROR GRÁFICA PESO OMS:", error);
    });

    // ==========================================
    // GRÁFICA IMC PARA LA EDAD - OMS 2007
    // ==========================================
    actualizarGraficaIMC().catch(error => {
        console.error("ERROR GRÁFICA IMC:", error);
    });

    // ==========================================
    // GRÁFICA TALLA PARA LA EDAD - OMS 2007
    // ==========================================
    actualizarGraficaTallaOMS().catch(error => {
        console.error("ERROR GRÁFICA TALLA OMS:", error);
    });

}


// ==========================================
// EVENTOS DEL FORMULARIO
// ==========================================
selector.addEventListener("change", () => {
    actualizarEdad();
    mostrarHistorial();
    actualizarGraficas();
    mostrarEvaluacionOMS();
});

document.getElementById("fecha_medicion")
    .addEventListener("change", actualizarEdad);

// ==========================================
// INICIAR MÓDULO
// ==========================================
async function iniciar() {
    try {
        // Primero verificamos los permisos.
        await verificarPermisos();

        // Después cargamos la información.
        await cargarNinos();
        await cargarMediciones();

    } catch (error) {
        console.error(
            "ERROR INICIO CRECIMIENTO:",
            error
        );

        mostrarMensaje(error.message, "danger");
    }
}

iniciar();
