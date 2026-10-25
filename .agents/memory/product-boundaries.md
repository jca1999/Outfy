---
name: Outfy product boundaries
description: User-stated connection model and development cost constraints.
---

Outfy connections are mutual friendships, not followers or dating behavior.

**Why:** The user explicitly defined Connections V1 this way.

**How to apply:** Preserve the mutual relationship model when extending social features; do not substitute a follower model or compatibility/dating system.

Followers/Following es un sistema unilateral separado: seguir a alguien está permitido incluso si su perfil es privado, sin aprobación, pero no concede acceso adicional ni convierte al seguidor en amigo.

**Why:** El usuario definió expresamente esta separación para Followers / Following V1.

**How to apply:** Resolver permisos friends-only únicamente mediante Connections aceptadas; nunca usar follows para abrir datos privados ni modificar Connections al seguir o dejar de seguir.

Development must remain compatible with the user's current 0€ goal.

**Why:** The user explicitly required this cost boundary.

**How to apply:** Avoid adding paid services or unnecessary dependencies to implement social features.

En Outfy, mantener español e inglés en el mismo cambio, así como tema claro/oscuro y responsive móvil/escritorio.

**Why:** El usuario lo exige al integrar funciones en la interfaz.

**How to apply:** Incluir ambas traducciones y comprobar los modos y tamaños relevantes cuando se cambie la interfaz.
