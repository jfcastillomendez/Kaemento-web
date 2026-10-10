// Indicative coverage only. Never selects quantities or modifies an order.
(() => {
  const estimate = area => Number.isFinite(area) && area > 0 && area <= 100000
    ? {min:Math.ceil(area / 12),max:Math.ceil(area / 10)} : null;
  if (typeof module === 'object' && module.exports) {module.exports = {estimate};return;}
  document.querySelectorAll('[data-bold-purchase]').forEach((panel,index) => {
    const details = document.createElement('details'); details.className = 'kae-kit-estimate';
    details.innerHTML = `<summary>¿Cuántos kits necesito?</summary><label for="kae-area-${index}">Área total por intervenir (m²)<input id="kae-area-${index}" type="number" min="0.01" max="100000" step="any" inputmode="decimal" placeholder="Ej. 26"></label><output aria-live="polite">Indica el área de piso y paredes que vas a recubrir.</output><p>Estimación con un rendimiento de 10 a 12 m² por kit. La cantidad final depende del soporte y la aplicación; valida tu proyecto con KAEMENTO. No modifica tu carrito.</p>`;
    const input = details.querySelector('input'), result = details.querySelector('output');
    input.addEventListener('input',() => {
      const kits = estimate(input.valueAsNumber);
      result.textContent = !kits ? 'Indica un área válida mayor que cero.' :
        (kits.min === kits.max ? `Estimación: ${kits.min} ${kits.min === 1 ? 'kit' : 'kits'}.` : `Estimación: entre ${kits.min} y ${kits.max} kits.`) +
        (kits.max > 20 ? ' Para esta cantidad, solicita una cotización.' : '');
    });
    panel.querySelector('.kae-purchase-controls').before(details);
  });
})();
