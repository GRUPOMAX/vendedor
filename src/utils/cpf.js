export function onlyDigits(str = "") {
  return (str || "").replace(/\D/g, "");
}

export function formatCPF(str = "") {
  const d = onlyDigits(str).padStart(11, "0").slice(-11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
