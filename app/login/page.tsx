import Image from "next/image";
import styles from "./login.module.css";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <section className={styles.loginShell}>
        <div className={styles.brandArea}>
          <div className={styles.logoWrap}>
            <Image
              src="/celularte-logo.png"
              alt="CELULARTE"
              width={520}
              height={220}
              priority
              className={styles.logo}
            />
          </div>
          <span className={styles.productName}>INVENTARIO</span>
          <p className={styles.brandMessage}>Control de mercancía, claro y en un solo lugar.</p>
        </div>

        <form action="/api/auth/login" method="post" className={styles.card}>
          <div className={styles.cardHeading}>
            <span className={styles.eyebrow}>ACCESO CELULARTE</span>
            <h1>Bienvenido</h1>
            <p>Ingresa con tu cuenta para continuar.</p>
          </div>

          <label className={styles.field}>
            <span>Correo</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="nombre@celularte.com"
              required
            />
          </label>

          <label className={styles.field}>
            <span>Contraseña</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>

          {error && (
            <div className={styles.error} role="alert">
              Correo o contraseña incorrectos. Intenta nuevamente.
            </div>
          )}

          <button type="submit" className={styles.submit}>Iniciar sesión</button>
          <p className={styles.help}>Acceso exclusivo para colaboradores autorizados.</p>
        </form>
      </section>

      <footer className={styles.footer}>CELULARTE · SISTEMA DE INVENTARIO</footer>
    </main>
  );
}
