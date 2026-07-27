const WHATSAPP = "573003671548";
const EMAIL = "kaemento@gmail.com";

const menuButton = document.querySelector(".menu");
const navigation = document.querySelector(".nav nav");

menuButton?.addEventListener("click", () => {
  const open = navigation?.classList.toggle("open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
});

navigation?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navigation.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "Abrir menú");
  });
});

const categoryOf = (article) =>
  article.querySelector("small")?.textContent?.split("·")[0]?.trim() ?? "";
const galleryItems = [...document.querySelectorAll(".gallery article")];
const indexItems = [...document.querySelectorAll(".project-index article")];
const checkerShowcase = document.querySelector(".checker-showcase");
const projectIndex = document.querySelector(".project-index");

document.querySelectorAll(".filters button").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.textContent?.trim() ?? "Todos";
    document.querySelectorAll(".filters button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });

    galleryItems.forEach((article) => {
      article.hidden = selected !== "Todos" && categoryOf(article) !== selected;
    });
    indexItems.forEach((article) => {
      article.hidden = selected !== "Todos" && categoryOf(article) !== selected;
    });

    if (projectIndex) {
      projectIndex.hidden = !indexItems.some((article) => !article.hidden);
    }
    if (checkerShowcase) {
      checkerShowcase.hidden = selected !== "Todos" && selected !== "Microcemento";
    }
  });
});

const quoteForm = document.querySelector(".quote form");
quoteForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(quoteForm);
  const photoInput = quoteForm.elements.namedItem("fotos");
  const photoCount = photoInput?.files?.length ?? 0;
  const text = [
    "Hola KAEMENTO, quiero solicitar una cotización.",
    `Nombre: ${form.get("nombre")}`,
    `Empresa/copropiedad: ${form.get("empresa") || "No aplica"}`,
    `Teléfono: ${form.get("telefono")}`,
    `Correo: ${form.get("correo")}`,
    `Ciudad: ${form.get("ciudad")}`,
    `Tipo de proyecto: ${form.get("tipo")}`,
    `Área aproximada: ${form.get("area")} m²`,
    `Superficie actual: ${form.get("superficie")}`,
    `Servicio: ${form.get("servicio")}`,
    `Fecha estimada: ${form.get("fecha") || "Por definir"}`,
    `Descripción: ${form.get("descripcion")}`,
    photoCount > 0
      ? `Fotografías seleccionadas: ${photoCount}. Las adjuntaré manualmente en este chat.`
      : "No seleccioné fotografías en el formulario.",
  ].join("\n");

  const whatsappUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
  const opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent("Solicitud de cotización")}&body=${encodeURIComponent(text)}`;
  }
});
