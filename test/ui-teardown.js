export default async function () {
  await fetch("http://127.0.0.1:3001/__shutdown", { method: "POST" }).catch(
    () => {},
  );
}
