---
name: Outfy product boundaries
description: User-stated connection model and development cost constraints.
---

Outfy connections are mutual friendships, not followers or dating behavior.

**Why:** The user explicitly defined Connections V1 this way.

**How to apply:** Preserve the mutual relationship model when extending social features; do not substitute a follower model or compatibility/dating system.

Outfy V1 tendrá únicamente el sistema social visible de Conexiones. Followers/Following queda aparcado: conservar API/backend, `public.user_follows` y la migración `014_user_follows.sql`, sin controles, contadores, listas ni consultas de follows desde la interfaz.

**Why:** El usuario decidió simplificar la experiencia actual y reservar follows para un posible futuro feed.

**How to apply:** Resolver permisos friends-only únicamente mediante Connections aceptadas. No reintroducir follows en la interfaz sin petición expresa. No se necesita seguir a una persona para ver sus planes públicos; la visibilidad Público/Solo conexiones/Privado y el bloque de planes públicos del perfil son roadmap, no alcance actual.

Development must remain compatible with the user's current 0€ goal.

**Why:** The user explicitly required this cost boundary.

**How to apply:** Avoid adding paid services or unnecessary dependencies to implement social features.

En Outfy, mantener español e inglés en el mismo cambio, así como tema claro/oscuro y responsive móvil/escritorio.

**Why:** El usuario lo exige al integrar funciones en la interfaz.

**How to apply:** Incluir ambas traducciones y comprobar los modos y tamaños relevantes cuando se cambie la interfaz.
