import { useState, useEffect, useRef } from "react";

const FAV_KEY = "chef-favs-v2";
const API_TIMEOUT = 30000; // 30 seconds
const MAX_CONTEXT_MESSAGES = 10; // Limit API context for cost

const CHEF_SYSTEM = `Eres Chef Creativo, un chef experto en cocina internacional (italiana, japonesa, mexicana, francesa, chilena, tailandesa, árabe, peruana, española, india, y más). También eres experto en Thermomix — conoces velocidades (1-10 y Turbo), temperaturas, tiempos, función Varoma, giro a la izquierda, y todas las técnicas específicas.

REGLAS ABSOLUTAS:
- Responde SIEMPRE en español
- NUNCA uses markdown en respuestas de texto libre
- Cuando propongas opciones de platos, devuelve SOLO este JSON sin texto extra:
{"tipo":"opciones","opciones":[{"id":1,"emoji":"🍜","nombre":"Nombre","origen":"País","desc":"Una línea descriptiva apetitosa","tiempo":"30 min","dificultad":"Fácil"},{"id":2,...},{"id":3,...}]}

- Cuando des una receta completa, devuelve SOLO este JSON:
{"tipo":"receta","nombre":"Nombre del plato","origen":"País","emoji":"🍜","desc":"Descripción breve y apetitosa en 2 oraciones","dificultad":"Fácil","tiempo_total":"30 min","porciones":2,"ingredientes":[{"nombre":"Ingrediente","cantidad":"200g"}],"pasos":[{"titulo":"Título corto","instruccion":"Instrucción detallada y clara","timer_seg":0}],"tips":["tip concreto 1","tip concreto 2"],"maridaje":"Sugerencia de bebida"}

- Si el método es Thermomix: adapta TODOS los pasos con instrucciones exactas (velocidad, temperatura, tiempo, sentido de giro). Cada paso debe indicar parámetros precisos, ej: "Programa 5 min / 100°C / vel 2". Incluye tips específicos de Thermomix.
- timer_seg: segundos de espera si el paso requiere tiempo pasivo. 0 si es acción manual.
- Si el input es ambiguo propón siempre 3 opciones con el JSON de opciones.
- Si el usuario dice "sorpréndeme", elige algo interesante y ve directo al JSON de receta.`;

const COLORS = {
  bg: "var(--color-background-primary)",
  bg2: "var(--color-background-secondary)",
  text: "var(--color-text-primary)",
  muted: "var(--color-text-secondary)",
  hint: "var(--color-text-tertiary)",
  border: "var(--color-border-tertiary)",
  border2: "var(--color-border-secondary)",
};

// Extracted styles for better maintainability
const STYLES = {
  tag: (accent, amber) => ({
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500,
    background: accent ? "#EEEDFE" : amber ? "#FFF8EC" : COLORS.bg2,
    color: accent ? "#3C3489" : amber ? "#854F0B" : COLORS.muted,
    border: `0.5px solid ${accent ? "#AFA9EC" : amber ? "#FAC775" : COLORS.border}`,
  }),
  button: {
    base: {
      cursor: "pointer",
      border: "none",
      fontSize: 14,
      fontWeight: 600,
      transition: "all 0.2s",
    },
  },
};

function ErrorBoundary({ children }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: COLORS.muted, marginBottom: 12 }}>
          Algo salió mal. Recarga la página.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "#534AB7",
            color: "white",
            cursor: "pointer",
          }}
        >
          Recargar
        </button>
      </div>
    );
  }

  return (
    <div
      onError={() => setHasError(true)}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}

function Tag({ children, accent, amber }) {
  return <span style={STYLES.tag(accent, amber)}>{children}</span>;
}

function Timer({ seg }) {
  const [left, setLeft] = useState(seg);
  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);
  const iv = useRef();

  useEffect(() => {
    if (on && !done) {
      iv.current = setInterval(() =>
        setLeft((v) => {
          if (v <= 1) {
            clearInterval(iv.current);
            setOn(false);
            setDone(true);
            return 0;
          }
          return v - 1;
        }),
        1000
      );
    }
    return () => clearInterval(iv.current);
  }, [on, done]);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        background: done ? "#EAF3DE" : "#FFF8EC",
        border: `0.5px solid ${done ? "#97C459" : "#FAC775"}`,
      }}
    >
      <span style={{ fontSize: 20 }}>{done ? "✅" : "⏱"}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: done ? 13 : 16,
            fontWeight: 600,
            color: done ? "#3B6D11" : "#854F0B",
          }}
        >
          {done ? "¡Listo! Puedes continuar" : fmt(left)}
        </div>
        {!done && (
          <div style={{ fontSize: 11, color: "#EF9F27", marginTop: 1 }}>
            Temporizador
          </div>
        )}
      </div>
      {!done && (
        <button
          onClick={() => setOn((v) => !v)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: `0.5px solid ${on ? "#EF9F27" : "#D3D1C7"}`,
            background: on ? "#FAEEDA" : COLORS.bg,
            color: on ? "#633806" : COLORS.text,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {on ? "Pausar" : "Iniciar"}
        </button>
      )}
    </div>
  );
}

function StepCocinando({ receta, onFin, onVolver }) {
  const [i, setI] = useState(0);
  const [accOpen, setAccOpen] = useState(false);
  const total = receta.pasos.length;
  const p = receta.pasos[i];
  const esUltimo = i === total - 1;
  const pct = Math.round((i / total) * 100);

  return (
    <div
      style={{
        background: COLORS.bg,
        border: `0.5px solid ${COLORS.border}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg,#534AB7,#7F77DD)",
          padding: "20px 20px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <button
            onClick={onVolver}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 8,
              padding: "6px 10px",
              color: "white",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ← Receta
          </button>
          <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
            Paso {i + 1} de {total}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 28 }}>{receta.emoji}</span>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>
              {receta.nombre}
            </div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              Modo cocina activo
            </div>
          </div>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.2)",
            borderRadius: 4,
            height: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "white",
              borderRadius: 4,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 6,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          {receta.pasos.map((_, idx) => (
            <div
              key={idx}
              onClick={() => setI(idx)}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                background:
                  idx < i
                    ? "rgba(255,255,255,0.9)"
                    : idx === i
                      ? "white"
                      : "rgba(255,255,255,0.25)",
                color: idx <= i ? "#534AB7" : "rgba(255,255,255,0.6)",
                border:
                  idx === i ? "2px solid white" : "2px solid transparent",
              }}
            >
              {idx < i ? "✓" : idx + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Paso actual */}
      <div style={{ padding: "24px 20px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 20,
            background: "#EEEDFE",
            color: "#534AB7",
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 10,
            letterSpacing: "0.5px",
          }}
        >
          PASO {i + 1}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>
          {p.titulo}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.8, color: COLORS.muted }}>
          {p.instruccion}
        </div>
        {p.timer_seg > 0 && <Timer key={`${i}-t`} seg={p.timer_seg} />}
      </div>

      {/* Botones */}
      <div style={{ padding: "0 20px 16px", display: "flex", gap: 10 }}>
        {i > 0 && (
          <button
            onClick={() => setI((v) => v - 1)}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 12,
              border: `0.5px solid ${COLORS.border2}`,
              background: COLORS.bg,
              color: COLORS.text,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            ← Anterior
          </button>
        )}
        <button
          onClick={() => (esUltimo ? onFin() : setI((v) => v + 1))}
          style={{
            flex: 2,
            padding: "12px",
            borderRadius: 12,
            border: "none",
            background: esUltimo ? "#1D9E75" : "#534AB7",
            color: "white",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
            boxShadow: esUltimo
              ? "0 4px 12px rgba(29,158,117,0.3)"
              : "0 4px 12px rgba(83,74,183,0.3)",
          }}
        >
          {esUltimo ? "🎉 ¡Terminé!" : "Paso completado →"}
        </button>
      </div>

      {/* Acordeón receta */}
      <div style={{ borderTop: `0.5px solid ${COLORS.border}` }}>
        <button
          onClick={() => setAccOpen((v) => !v)}
          style={{
            width: "100%",
            padding: "12px 20px",
            background: COLORS.bg2,
            border: "none",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{receta.emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#534AB7" }}>
              Ver receta completa
            </span>
          </div>
          <span
            style={{
              color: "#534AB7",
              fontSize: 14,
              display: "inline-block",
              transform: accOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          >
            ▾
          </span>
        </button>
        {accOpen && (
          <div
            style={{
              padding: "16px 20px 20px",
              background: COLORS.bg2,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.hint,
                letterSpacing: "0.5px",
              }}
            >
              INGREDIENTES
            </div>
            {receta.ingredientes.map((ing, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "7px 0",
                  borderBottom: `0.5px solid ${COLORS.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#7F77DD",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: COLORS.text }}>
                    {ing.nombre}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "#534AB7",
                    fontWeight: 600,
                    background: "#EEEDFE",
                    padding: "2px 7px",
                    borderRadius: 6,
                  }}
                >
                  {ing.cantidad}
                </span>
              </div>
            ))}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.hint,
                letterSpacing: "0.5px",
                marginTop: 6,
              }}
            >
              TODOS LOS PASOS
            </div>
            {receta.pasos.map((paso, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 10,
                  opacity: idx === i ? 1 : 0.5,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background:
                      idx < i ? "#1D9E75" : idx === i ? "#534AB7" : "#E8E6F0",
                    color: idx <= i ? "white" : "#888",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {idx < i ? "✓" : idx + 1}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: idx === i ? 700 : 500,
                      color: idx === i ? "#534AB7" : COLORS.muted,
                    }}
                  >
                    {paso.titulo}
                  </div>
                  {idx === i && (
                    <div style={{ fontSize: 10, color: COLORS.hint, marginTop: 1 }}>
                      ← estás aquí
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecetaCard({ receta, guardada, onGuardar, onCocinar }) {
  const [tab, setTab] = useState("ing");
  const tabs = [
    ["ing", "🧂 Ingredientes"],
    ["pasos", "📋 Preparación"],
    ["tips", "💡 Tips"],
    ["mar", "🍷 Maridaje"],
  ];
  const isThermomix = receta.thermomix;

  return (
    <div
      style={{
        background: COLORS.bg,
        border: `0.5px solid ${COLORS.border}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg,#1a1a2e,#2d2b5e)",
          padding: "24px 20px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 48, lineHeight: 1 }}>{receta.emoji}</span>
            <div>
              <div
                style={{
                  color: "white",
                  fontWeight: 800,
                  fontSize: 20,
                  lineHeight: 1.2,
                }}
              >
                {receta.nombre}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                🌍 {receta.origen}
              </div>
              {isThermomix && (
                <div
                  style={{
                    marginTop: 6,
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: 20,
                    background: "rgba(255,255,255,0.15)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    fontSize: 11,
                    color: "white",
                  }}
                >
                  ⚙️ Thermomix
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onGuardar}
            style={{
              background: guardada ? "rgba(240,153,123,0.3)" : "rgba(255,255,255,0.15)",
              border: `1px solid ${guardada ? "#F0997B" : "rgba(255,255,255,0.3)"}`,
              borderRadius: 10,
              padding: "8px 12px",
              color: "white",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            {guardada ? "♥" : "♡"}
          </button>
        </div>
        <p
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 13,
            margin: "14px 0",
            lineHeight: 1.7,
          }}
        >
          {receta.desc}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["⏱", receta.tiempo_total],
            ["👨‍🍳", receta.dificultad],
            ["🍽", `${receta.porciones} porciones`],
          ].map(([ic, lb]) => (
            <div
              key={lb}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <span style={{ fontSize: 12 }}>{ic}</span>
              <span style={{ color: "white", fontSize: 12, fontWeight: 500 }}>{lb}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          borderBottom: `0.5px solid ${COLORS.border}`,
          background: COLORS.bg2,
        }}
      >
        {tabs.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1,
              padding: "12px 4px",
              border: "none",
              borderBottom: `2px solid ${tab === k ? "#534AB7" : "transparent"}`,
              background: "transparent",
              color: tab === k ? "#534AB7" : COLORS.hint,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: tab === k ? 700 : 400,
              transition: "all 0.2s",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px", minHeight: 160 }}>
        {tab === "ing" && (
          <div>
            {receta.ingredientes.map((ing, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom:
                    i < receta.ingredientes.length - 1
                      ? `0.5px solid ${COLORS.border}`
                      : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#7F77DD",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 14, color: COLORS.text }}>{ing.nombre}</span>
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: "#534AB7",
                    fontWeight: 600,
                    background: "#EEEDFE",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {ing.cantidad}
                </span>
              </div>
            ))}
          </div>
        )}
        {tab === "pasos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {receta.pasos.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#534AB7",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: COLORS.text,
                      marginBottom: 4,
                    }}
                  >
                    {p.titulo}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: COLORS.muted }}>
                    {p.instruccion}
                  </div>
                  {p.timer_seg > 0 && (
                    <Tag amber style={{ marginTop: 6, display: "inline-block" }}>
                      ⏱ {Math.floor(p.timer_seg / 60)} min
                    </Tag>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "tips" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(receta.tips || []).map((t, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#FFFBF0",
                  border: `0.5px solid #FAC775`,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: 13, lineHeight: 1.6, color: "#444" }}>{t}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "mar" && (
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "14px",
              borderRadius: 12,
              background: "#F8F0FF",
              border: `0.5px solid #DDD9F5`,
            }}
          >
            <span style={{ fontSize: 28, flexShrink: 0 }}>🍷</span>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#3C3489",
                  marginBottom: 4,
                }}
              >
                Sugerencia del chef
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#534AB7" }}>
                {receta.maridaje}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        <button
          onClick={onCocinar}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            border: "none",
            background: "linear-gradient(135deg,#534AB7,#7F77DD)",
            color: "white",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(83,74,183,0.35)",
          }}
        >
          {isThermomix ? "⚙️ Cocinar con Thermomix →" : "👨‍🍳 Empezar a cocinar →"}
        </button>
      </div>
    </div>
  );
}

function OpcionesCard({ data, onElegir }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.pregunta && (
        <div
          style={{
            fontSize: 14,
            color: "#534AB7",
            fontWeight: 500,
            marginBottom: 2,
            paddingLeft: 36,
          }}
        >
          {data.pregunta}
        </div>
      )}
      {data.opciones.map((op) => (
        <button
          key={op.id}
          onClick={() => onElegir(op)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px",
            borderRadius: 14,
            border: `0.5px solid ${COLORS.border}`,
            background: COLORS.bg,
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>
            {op.emoji}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: COLORS.text,
                marginBottom: 2,
              }}
            >
              {op.nombre}
            </div>
            <div style={{ fontSize: 11, color: COLORS.hint, marginBottom: 4 }}>
              🌍 {op.origen}
            </div>
            <div
              style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.4, marginBottom: 7 }}
            >
              {op.desc}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Tag accent>⏱ {op.tiempo}</Tag>
              <Tag>{op.dificultad}</Tag>
            </div>
          </div>
          <span style={{ color: COLORS.border, fontSize: 20, flexShrink: 0 }}>›</span>
        </button>
      ))}
    </div>
  );
}

function FavoritosView({ favs, onEliminar, onCocinar, onVolver }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
          paddingBottom: 12,
          borderBottom: `0.5px solid ${COLORS.border}`,
        }}
      >
        <button
          onClick={onVolver}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: `0.5px solid ${COLORS.border}`,
            background: COLORS.bg,
            color: COLORS.text,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ←
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.text }}>
            Mis recetas
          </div>
          <div style={{ fontSize: 11, color: COLORS.hint }}>
            {favs.length} guardadas
          </div>
        </div>
      </div>
      {favs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, color: COLORS.hint }}>
            Aún no tienes recetas guardadas
          </div>
        </div>
      ) : (
        favs.map((r, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px",
              borderRadius: 14,
              border: `0.5px solid ${COLORS.border}`,
              background: COLORS.bg,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 28 }}>{r.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>
                {r.nombre}
              </div>
              <div style={{ fontSize: 11, color: COLORS.hint, marginTop: 2 }}>
                🌍 {r.origen} · ⏱ {r.tiempo_total}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => onCocinar(r)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: `0.5px solid #AFA9EC`,
                  background: "#EEEDFE",
                  color: "#3C3489",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                Cocinar
              </button>
              <button
                onClick={() => onEliminar(i)}
                style={{
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: `0.5px solid #F0997B`,
                  background: "#FAECE7",
                  color: "#993C1D",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const FILTROS_DEF = [
  {
    key: "tiempo",
    emoji: "⏱",
    label: "¿Cuánto tiempo tienes?",
    opts: ["15-20 min", "30-45 min", "1 hora", "2+ horas"],
  },
  {
    key: "metodo",
    emoji: "🔥",
    label: "¿Cómo quieres cocinar?",
    opts: ["Sartén / olla", "Horno", "Parrilla / BBQ", "Thermomix", "Sin cocción"],
  },
  {
    key: "personas",
    emoji: "👤",
    label: "¿Para cuántas personas?",
    opts: ["Solo yo", "2-3", "4-6", "Muchos"],
  },
];

const SUGERENCIAS = [
  "Pollo",
  "Pasta italiana",
  "Algo japonés",
  "Sorpréndeme",
  "Cena rápida",
  "Vegetariano",
  "Mariscos",
  "Carne al horno",
];

function Filtros({ filtros, setFiltros, onStart, favs, onCocinarFav }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🍳</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text, marginBottom: 6 }}>
          Chef Creativo
        </div>
        <div style={{ fontSize: 13, color: COLORS.hint, lineHeight: 1.6 }}>
          Cocina internacional a tu medida
        </div>
      </div>
      {FILTROS_DEF.map((f) => (
        <div
          key={f.key}
          style={{
            background: COLORS.bg,
            borderRadius: 16,
            padding: "16px",
            border: `0.5px solid ${COLORS.border}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.text,
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{f.emoji}</span>
            {f.label}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {f.opts.map((o) => {
              const sel = filtros[f.key] === o;
              const isTmx = o === "Thermomix";
              return (
                <button
                  key={o}
                  onClick={() =>
                    setFiltros((v) => ({
                      ...v,
                      [f.key]: sel ? undefined : o,
                    }))
                  }
                  style={{
                    padding: "8px 14px",
                    borderRadius: 20,
                    border: `1.5px solid ${
                      sel ? (isTmx ? "#1D9E75" : "#534AB7") : COLORS.border
                    }`,
                    background: sel ? (isTmx ? "#1D9E75" : "#534AB7") : COLORS.bg,
                    color: sel ? "white" : COLORS.muted,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: sel ? 600 : 400,
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {isTmx && <span style={{ fontSize: 12 }}>⚙️</span>}
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        onClick={onStart}
        style={{
          padding: "15px",
          borderRadius: 14,
          border: "none",
          background: "linear-gradient(135deg,#534AB7,#7F77DD)",
          color: "white",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 6px 20px rgba(83,74,183,0.35)",
        }}
      >
        Empezar →
      </button>
      {favs.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: COLORS.hint,
              letterSpacing: "0.5px",
              marginBottom: 10,
            }}
          >
            MIS RECETAS GUARDADAS
          </div>
          {favs.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 14,
                border: `0.5px solid ${COLORS.border}`,
                background: COLORS.bg,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 26 }}>{r.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.text }}>
                  {r.nombre}
                </div>
                <div style={{ fontSize: 11, color: COLORS.hint, marginTop: 1 }}>
                  🌍 {r.origen} · ⏱ {r.tiempo_total}
                </div>
              </div>
              <button
                onClick={() => onCocinarFav(r)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 20,
                  border: "none",
                  background: "#534AB7",
                  color: "white",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cocinar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to call Claude with timeout
async function callClaudeAPI(messages, signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.REACT_APP_ANTHROPIC_API_KEY || "",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: CHEF_SYSTEM,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `API Error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data.content?.map((b) => b.text || "").join("").trim() || "";
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("La solicitud tardó demasiado. Intenta de nuevo.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function App() {
  const [fase, setFase] = useState("filtros");
  const [filtros, setFiltros] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [receta, setReceta] = useState(null);
  const [cocinando, setCocinando] = useState(false);
  const [favs, setFavs] = useState([]);
  const [vista, setVista] = useState("chat");
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage?.get(FAV_KEY);
        if (r?.value) setFavs(JSON.parse(r.value));
      } catch (e) {
        console.error("Error loading favorites:", e);
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const saveFavs = (arr) => {
    setFavs(arr);
    window.storage
      ?.set(FAV_KEY, JSON.stringify(arr))
      .catch((e) => console.error("Error saving favorites:", e));
  };

  const toggleFav = () => {
    if (!receta) return;
    const ya = favs.some((f) => f.nombre === receta.nombre);
    saveFavs(
      ya
        ? favs.filter((f) => f.nombre !== receta.nombre)
        : [...favs, receta]
    );
  };

  const parseResp = (raw) => {
    try {
      const c = raw.replace(/```json|```/g, "").trim();
      const m = c.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch (e) {
      console.error("Parse error:", e);
    }
    return null;
  };

  const buildCtx = () => {
    const f = filtros;
    const parts = [
      f.tiempo && `tiempo: ${f.tiempo}`,
      f.metodo && `método de cocción: ${f.metodo}`,
      f.personas && `personas: ${f.personas}`,
    ].filter(Boolean);
    return parts.length ? `[${parts.join(", ")}] ` : "";
  };

  const limitContext = (msgs) => {
    // Only send last N messages to API to reduce costs
    if (msgs.length > MAX_CONTEXT_MESSAGES) {
      return msgs.slice(-MAX_CONTEXT_MESSAGES);
    }
    return msgs;
  };

  const enviar = async (txt) => {
    const t = (txt || input).trim();
    if (!t || loading) return;

    setInput("");
    const nuevos = [...msgs, { role: "user", text: t }];
    setMsgs(nuevos);
    setLoading(true);

    const userMsg = buildCtx() + t;
    const apiMsgs = limitContext(nuevos)
      .slice(0, -1)
      .map((m) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.text || (m.data ? JSON.stringify(m.data) : ""),
      }));
    apiMsgs.push({ role: "user", content: userMsg });

    try {
      const raw = await callClaudeAPI(apiMsgs);
      const p = parseResp(raw);

      if (p?.tipo === "receta") {
        p.thermomix = filtros.metodo === "Thermomix";
        setReceta(p);
        setCocinando(false);
        setMsgs((v) => [
          ...v,
          {
            role: "bot",
            text: `Aquí tienes: ${p.nombre} ${p.emoji}`,
            data: p,
          },
        ]);
      } else if (p?.tipo === "opciones") {
        setMsgs((v) => [
          ...v,
          {
            role: "bot",
            text: p.pregunta || "¿Qué te apetece?",
            data: p,
          },
        ]);
      } else {
        setMsgs((v) => [
          ...v,
          {
            role: "bot",
            text: "No entendí bien. ¿Puedes repetir?",
          },
        ]);
      }
    } catch (error) {
      console.error("Error:", error);
      setMsgs((v) => [
        ...v,
        {
          role: "bot",
          text: error.message || "Error de conexión. Intenta de nuevo.",
        },
      ]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const elegirOpcion = async (op) => {
    const txt = `Quiero la receta de ${op.nombre}`;
    const nuevos = [...msgs, { role: "user", text: txt }];
    setMsgs(nuevos);
    setLoading(true);

    const userMsg = buildCtx() + `Dame la receta completa de ${op.nombre} de ${op.origen}.`;
    const apiMsgs = limitContext(nuevos)
      .slice(0, -1)
      .map((m) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.text || (m.data ? JSON.stringify(m.data) : ""),
      }));
    apiMsgs.push({ role: "user", content: userMsg });

    try {
      const raw = await callClaudeAPI(apiMsgs);
      const p = parseResp(raw);

      if (p?.tipo === "receta") {
        p.thermomix = filtros.metodo === "Thermomix";
        setReceta(p);
        setCocinando(false);
        setMsgs((v) => [
          ...v,
          {
            role: "bot",
            text: `Aquí tienes: ${p.nombre} ${p.emoji}`,
            data: p,
          },
        ]);
      } else {
        setMsgs((v) => [
          ...v,
          {
            role: "bot",
            text: "No pude cargar esa receta. Intenta de nuevo.",
          },
        ]);
      }
    } catch (error) {
      console.error("Error:", error);
      setMsgs((v) => [
        ...v,
        {
          role: "bot",
          text: error.message || "Error de conexión.",
        },
      ]);
    }
    setLoading(false);
  };

  const iniciarChat = () => {
    const f = filtros;
    const parts = [
      f.tiempo && `tienes ${f.tiempo}`,
      f.metodo && `cocinas en ${f.metodo}`,
      f.personas && `para ${f.personas.toLowerCase()}`,
    ].filter(Boolean);
    const intro = parts.length
      ? `Perfecto, ${parts.join(", ")}. ¿Qué quieres cocinar hoy?`
      : "¡Listo! ¿Qué quieres cocinar hoy?";
    setMsgs([{ role: "bot", text: intro }]);
    setFase("chat");
  };

  const esGuardada = receta && favs.some((f) => f.nombre === receta.nombre);

  if (vista === "favs") {
    return (
      <ErrorBoundary>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            maxWidth: 560,
            margin: "0 auto",
            padding: "16px",
          }}
        >
          <FavoritosView
            favs={favs}
            onEliminar={(i) =>
              saveFavs(favs.filter((_, idx) => idx !== i))
            }
            onCocinar={(r) => {
              setReceta(r);
              setCocinando(true);
              setVista("chat");
            }}
            onVolver={() => setVista("chat")}
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          maxWidth: 560,
          margin: "0 auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: COLORS.bg2,
          minHeight: "100vh",
        }}
      >
        {fase === "filtros" && (
          <Filtros
            filtros={filtros}
            setFiltros={setFiltros}
            onStart={iniciarChat}
            favs={favs}
            onCocinarFav={(r) => {
              setReceta(r);
              setCocinando(true);
              setFase("chat");
              setMsgs([
                {
                  role: "bot",
                  text: `¡Vamos a cocinar ${r.nombre} ${r.emoji}!`,
                },
              ]);
            }}
          />
        )}

        {fase === "chat" && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: COLORS.bg,
                borderRadius: 16,
                border: `0.5px solid ${COLORS.border}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "linear-gradient(135deg,#534AB7,#7F77DD)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  🍳
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: COLORS.text,
                    }}
                  >
                    Chef Creativo
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.hint }}>
                    Cocina internacional
                    {filtros.metodo === "Thermomix" ? " · ⚙️ Thermomix" : ""}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {favs.length > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: "3px 7px",
                      borderRadius: 20,
                      background: "#FAECE7",
                      color: "#993C1D",
                      fontWeight: 600,
                    }}
                  >
                    ♥ {favs.length}
                  </span>
                )}
                <button
                  onClick={() => setVista("favs")}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 9,
                    border: `0.5px solid ${COLORS.border}`,
                    background: COLORS.bg,
                    color: COLORS.muted,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  Mis recetas
                </button>
              </div>
            </div>

            {receta && cocinando && (
              <StepCocinando
                receta={receta}
                onFin={() => {
                  setCocinando(false);
                  setMsgs((v) => [
                    ...v,
                    {
                      role: "bot",
                      text: `🎉 ¡Listo! Espero que el ${receta.nombre} haya quedado delicioso. ¿Quieres otra receta?`,
                    },
                  ]);
                }}
                onVolver={() => setCocinando(false)}
              />
            )}

            {receta && !cocinando && (
              <RecetaCard
                receta={receta}
                guardada={esGuardada}
                onGuardar={toggleFav}
                onCocinar={() => setCocinando(true)}
              />
            )}

            {!cocinando && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {msgs.map((m, i) => (
                  <div key={i}>
                    {m.text && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            m.role === "user" ? "flex-end" : "flex-start",
                        }}
                      >
                        {m.role === "bot" && (
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg,#534AB7,#7F77DD)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 14,
                              marginRight: 8,
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            🍳
                          </div>
                        )}
                        <div
                          style={{
                            maxWidth: "80%",
                            padding: "10px 14px",
                            borderRadius:
                              m.role === "user"
                                ? "16px 16px 4px 16px"
                                : "16px 16px 16px 4px",
                            background: m.role === "user" ? "#534AB7" : COLORS.bg,
                            color: m.role === "user" ? "white" : COLORS.text,
                            border:
                              m.role === "user"
                                ? "none"
                                : `0.5px solid ${COLORS.border}`,
                            fontSize: 13,
                            lineHeight: 1.6,
                            boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                          }}
                        >
                          {m.text}
                        </div>
                      </div>
                    )}
                    {m.data?.tipo === "opciones" && (
                      <div style={{ marginTop: 8 }}>
                        <OpcionesCard
                          data={m.data}
                          onElegir={elegirOpcion}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg,#534AB7,#7F77DD)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                      }}
                    >
                      🍳
                    </div>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "16px 16px 16px 4px",
                        background: COLORS.bg,
                        border: `0.5px solid ${COLORS.border}`,
                        fontSize: 13,
                        color: COLORS.hint,
                      }}
                    >
                      Cocinando la respuesta...
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}

            {!cocinando && msgs.length <= 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 20,
                      border: `0.5px solid ${COLORS.border}`,
                      background: COLORS.bg,
                      color: COLORS.muted,
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 500,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {!cocinando && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  position: "sticky",
                  bottom: 0,
                  paddingBottom: 4,
                }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                  placeholder={
                    filtros.metodo === "Thermomix"
                      ? 'Ej: "risotto", "bechamel", "sorpréndeme"...'
                      : 'Escribe un ingrediente, plato, o "sorpréndeme"...'
                  }
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: `0.5px solid ${COLORS.border2}`,
                    fontSize: 13,
                    background: COLORS.bg,
                    color: COLORS.text,
                    outline: "none",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                />
                <button
                  onClick={() => enviar()}
                  disabled={loading}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: "none",
                    background: "linear-gradient(135deg,#534AB7,#7F77DD)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 16,
                    opacity: loading ? 0.5 : 1,
                    boxShadow: "0 4px 12px rgba(83,74,183,0.35)",
                  }}
                >
                  →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}