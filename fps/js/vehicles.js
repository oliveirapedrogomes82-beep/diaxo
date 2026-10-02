'use strict';
// Veículos dirigíveis: física arcade sobre o relevo, colisão, combustível, dano e atropelamentos.

const Vehicles = {
  list: [], scene: null, light: null, engineSnd: null,

  init(scene) {
    this.scene = scene;
    this.light = new THREE.SpotLight(0xfff2cc, 0, 70, 0.55, 0.5, 1.2);
    scene.add(this.light, this.light.target);
  },
  clear() {
    for (const v of this.list) { this.scene.remove(v.mdl.root); if (v.col) Phys.remove(v.col); }
    this.list = [];
    if (this.engineSnd) { this.engineSnd.stop(); this.engineSnd = null; }
  },

  spawn(type, x, z, yaw, fuelFrac = null) {
    const def = VEHICLES[type];
    const mdl = Models.vehicle(type, U.pick(def.colors));
    const y = Phys.support(x, z, 1, 300);
    const v = {
      type, def, mdl, pos: new THREE.Vector3(x, y, z), yaw, speed: 0, steer: 0, hp: def.hp, fuel: def.fuel * (fuelFrac ?? (0.15 + Math.random() * 0.6)),
      pitch: 0, roll: 0, wheelRot: 0, vy: 0, dead: false, col: null, lights: false,
      hw: mdl.size[0] / 2, hl: mdl.size[2] / 2, ht: mdl.size[1],
    };
    this.scene.add(mdl.root);
    this.place(v, 0);
    this.list.push(v);
    return v;
  },

  forward(v) { return new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)); },

  updateCollider(v) {
    if (v.col) Phys.remove(v.col);
    const c = Math.abs(Math.cos(v.yaw)), s = Math.abs(Math.sin(v.yaw));
    const ex = c * v.hw * 0.92 + s * v.hl * 0.92, ez = s * v.hw * 0.92 + c * v.hl * 0.92;
    v.col = Phys.add({ x0: v.pos.x - ex, x1: v.pos.x + ex, z0: v.pos.z - ez, z1: v.pos.z + ez, y0: v.pos.y + 0.25, y1: v.pos.y + v.ht * 0.85, mat: 'metal', vehicle: v });
  },

  // Assenta o veículo no chão (quatro rodas).
  place(v, dt) {
    const fwd = this.forward(v), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wx = v.hw * 0.8, wz = v.hl * 0.62;
    const yMax = v.pos.y + 1.0;
    const H = (lx, lz) => Phys.support(v.pos.x + right.x * lx + fwd.x * lz, v.pos.z + right.z * lx + fwd.z * lz, 0.2, yMax);
    if (v.col) v.col.off = true;
    const fl = H(-wx, wz), fr = H(wx, wz), rl = H(-wx, -wz), rr = H(wx, -wz);
    if (v.col) v.col.off = false;
    const target = (fl + fr + rl + rr) / 4;
    const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, wz * 2);
    const roll = Math.atan2((fr + rr) / 2 - (fl + rl) / 2, wx * 2);
    if (dt === 0 || v.pos.y <= target + 0.02) { v.pos.y = target; v.vy = 0; }
    else { v.vy -= 20 * dt; v.pos.y = Math.max(target, v.pos.y + v.vy * dt); if (v.pos.y === target) v.vy = 0; }
    v.pitch += (pitch - v.pitch) * (dt ? Math.min(1, dt * 8) : 1);
    v.roll += (roll - v.roll) * (dt ? Math.min(1, dt * 8) : 1);
    const r = v.mdl.root;
    r.position.copy(v.pos);
    r.rotation.set(0, 0, 0);
    r.rotateY(v.yaw);
    r.rotateX(v.pitch);
    r.rotateZ(-v.roll);
    this.updateCollider(v);
  },

  raycast(o, dir, len, ignore) {
    let best = null;
    for (const v of this.list) {
      if (v === ignore) continue;
      if (Math.abs(v.pos.x - o.x) > len + 6 || Math.abs(v.pos.z - o.z) > len + 6) continue;
      const c = Math.cos(-v.yaw), s = Math.sin(-v.yaw);
      const rx = o.x - v.pos.x, ry = o.y - v.pos.y, rz = o.z - v.pos.z;
      const lx = rx * c + rz * s, lz = -rx * s + rz * c, dx = dir.x * c + dir.z * s, dz = -dir.x * s + dir.z * c;
      const h = Phys.rayBox(lx, ry, lz, dx, dir.y, dz, { x0: -v.hw, x1: v.hw, y0: 0.25, y1: v.ht, z0: -v.hl, z1: v.hl }, best ? best.t : len);
      if (h && h.t > 0) {
        const n = new THREE.Vector3(); n.setComponent(h.axis, h.sign);
        const wn = new THREE.Vector3(n.x * Math.cos(v.yaw) + n.z * Math.sin(v.yaw), n.y, -n.x * Math.sin(v.yaw) + n.z * Math.cos(v.yaw));
        best = { t: h.t, vehicle: v, normal: wn };
      }
    }
    if (best) best.point = o.clone().addScaledVector(dir, best.t);
    return best;
  },

  damage(v, dmg) {
    if (v.dead) return;
    v.hp -= dmg;
    if (v.hp <= 0) this.destroy(v);
  },
  destroy(v) {
    v.dead = true; v.hp = 0; v.speed = 0;
    v.mdl.body.material = MAT.color(0x2a2522);
    for (const w of v.mdl.wheels) w.visible = false;
    Explosions.blast(v.pos.clone().add(new THREE.Vector3(0, 1, 0)), 6, 140, 'player');
    FX.addFire(v.pos.clone(), 2.5, 20, 15);
    if (Player.vehicle === v) Player.exitVehicle(true);
  },

  near(pos, r = 3.6) {
    let best = null, bd = r;
    for (const v of this.list) {
      if (v.dead) continue;
      const fwd = this.forward(v);
      const rx = pos.x - v.pos.x, rz = pos.z - v.pos.z;
      const lz = rx * fwd.x + rz * fwd.z, lx = rx * -fwd.z + rz * fwd.x;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - v.hw), Math.max(0, Math.abs(lz) - v.hl));
      if (d < bd && Math.abs(pos.y - v.pos.y) < 3) { bd = d; best = v; }
    }
    return best;
  },

  update(dt) {
    for (const v of this.list) {
      if (Player.vehicle === v) this.drive(v, dt);
      else if (!v.dead) {
        if (Math.abs(v.speed) > 0.05) { v.speed *= Math.exp(-dt * 1.5); this.integrate(v, dt); }
        else if (v.vy !== 0 || v.settle === undefined) { this.place(v, dt); v.settle = true; }
      }
    }
    if (Player.vehicle) {
      const v = Player.vehicle, fwd = this.forward(v);
      this.light.position.copy(v.pos).addScaledVector(fwd, v.hl).y += 1.0;
      this.light.target.position.copy(this.light.position).addScaledVector(fwd, 10).y -= 1.6;
      this.light.intensity = v.lights ? 220 : 0;
    } else this.light.intensity = 0;
  },

  drive(v, dt) {
    const d = v.def;
    const In = Input;
    let thr = (In.k.KeyW ? 1 : 0) - (In.k.KeyS ? 1 : 0);
    const steer = (In.k.KeyA ? 1 : 0) - (In.k.KeyD ? 1 : 0);
    const brake = In.k.Space;
    if (v.fuel <= 0 || v.dead || v.pos.y < World.WATER - 1) thr = 0;
    if (thr) {
      if (Math.abs(v.speed) > 0.5 && Math.sign(thr) !== Math.sign(v.speed)) v.speed += thr * d.accel * 2.2 * dt;
      else {
        const top = thr > 0 ? d.speed : d.speed * 0.35;
        v.speed += thr * d.accel * dt * Math.max(0, 1 - Math.abs(v.speed) / top);
      }
    } else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 1.5 * dt);
    v.speed -= v.speed * 0.12 * dt;
    if (brake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 16 * dt);
    v.speed -= Math.sin(v.pitch) * 9.8 * 0.6 * dt;
    const maxSteer = 0.6 * (1 - Math.min(0.65, (Math.abs(v.speed) / d.speed) * 0.75));
    v.steer += (steer * maxSteer - v.steer) * Math.min(1, dt * 5);
    v.fuel = Math.max(0, v.fuel - (Math.abs(thr) * 0.12 + 0.004) * dt);
    if (v.pos.y < World.WATER - 0.9) { v.hp -= 25 * dt; v.speed *= 0.95; if (v.hp <= 0) this.destroy(v); }
    this.integrate(v, dt);
    // som do motor
    if (!this.engineSnd) this.engineSnd = Sfx.engine();
    if (this.engineSnd) this.engineSnd.set(Math.abs(v.speed) / d.speed + 0.1, Math.abs(thr));
    if (In.pressed('KeyQ')) { Sfx.horn(v.pos); Zombies.hear(v.pos, 90); }
    if (In.pressed('KeyF')) v.lights = !v.lights;
    Game.noiseT = (Game.noiseT || 0) - dt;
    if (Math.abs(v.speed) > 3 && Game.noiseT <= 0) { Game.noiseT = 1; Zombies.hear(v.pos, 30 + Math.abs(v.speed) * 2); }
  },

  integrate(v, dt) {
    const wb = v.hl * 1.25;
    v.yaw += (v.speed / wb) * Math.tan(v.steer) * dt;
    const fwd = this.forward(v);
    const ox = v.pos.x, oz = v.pos.z;
    v.pos.x += fwd.x * v.speed * dt; v.pos.z += fwd.z * v.speed * dt;
    // colisão com o cenário (três círculos ao longo do carro)
    const yLo = v.pos.y + 0.55, yHi = v.pos.y + v.ht;
    let impact = 0;
    const tmp = [];
    for (const k of [-0.58, 0, 0.58]) {
      const cx = v.pos.x + fwd.x * v.hl * k, cz = v.pos.z + fwd.z * v.hl * k, r = v.hw * 0.95;
      Phys.query(cx - r, cz - r, cx + r, cz + r, tmp);
      for (const c of tmp) {
        if (c === v.col || c.ghost || c.y1 < yLo || c.y0 > yHi) continue;
        if (c.vehicle && c.vehicle.dead === false && c.vehicle !== v) { /* outro carro */ }
        const px = U.clamp(cx, c.x0, c.x1), pz = U.clamp(cz, c.z0, c.z1);
        let dx = cx - px, dz = cz - pz, dd = Math.hypot(dx, dz);
        if (dd >= r) continue;
        if (dd < 1e-4) { dx = cx - (c.x0 + c.x1) / 2; dz = cz - (c.z0 + c.z1) / 2; dd = Math.hypot(dx, dz) || 1; }
        const push = r - dd;
        v.pos.x += (dx / dd) * push; v.pos.z += (dz / dd) * push;
        const nv = Math.abs((dx / dd) * fwd.x + (dz / dd) * fwd.z);
        impact = Math.max(impact, Math.abs(v.speed) * nv);
        if (c.tree && Math.abs(v.speed) > 12 && c.tree.type !== 'rock') { World.damageTree(c.tree, 999); }
      }
    }
    if (impact > 2) {
      v.speed *= 0.35;
      if (impact > 6) {
        v.hp -= impact * 4; Sfx.impact(v.pos, 'metal'); Game.shake(Math.min(1, impact / 15));
        if (impact > 13 && Player.vehicle === v) Player.damage((impact - 13) * 3, 'batida');
        if (v.hp <= 0) this.destroy(v);
      }
    }
    // atropelamentos
    const sp = Math.abs(v.speed);
    for (const z of Zombies.list) {
      if (z.dead) continue;
      const rx = z.b.p.x - v.pos.x, rz = z.b.p.z - v.pos.z;
      if (Math.abs(rx) > v.hl + 1 || Math.abs(rz) > v.hl + 1 || Math.abs(z.b.p.y - v.pos.y) > 2.5) continue;
      const lz = rx * fwd.x + rz * fwd.z, lx = rx * -fwd.z + rz * fwd.x;
      if (Math.abs(lx) < v.hw + 0.35 && Math.abs(lz) < v.hl + 0.35) {
        if (sp > 3.5) {
          Zombies.damage(z, sp * 10, 'body', fwd.clone(), Player.vehicle === v ? 'player' : null, null, true);
          FX.blood(z.b.p.clone().setY(z.b.p.y + 1), fwd, 1.5);
          v.speed *= z.t.knock ? 0.4 : 0.88; v.hp -= z.t.knock ? 25 : 3;
          z.b.v.x += fwd.x * sp * 0.8; z.b.v.z += fwd.z * sp * 0.8;
          Sfx.melee(z.b.p);
        }
        const side = lx >= 0 ? 1 : -1;
        z.b.p.x += -fwd.z * side * 0.3; z.b.p.z += fwd.x * side * 0.3;
      }
    }
    for (const a of Animals.list) {
      if (a.dead || sp < 4) continue;
      if (a.p.distanceTo(v.pos) < v.hl) Animals.damage(a, sp * 10);
    }
    const L = World.HALF - 3;
    v.pos.x = U.clamp(v.pos.x, -L, L); v.pos.z = U.clamp(v.pos.z, -L, L);
    v.wheelRot += (v.speed / v.mdl.wr) * dt;
    v.mdl.wheels.forEach((w, i) => { w.children[0].rotation.x = -v.wheelRot; w.rotation.y = i < 2 ? v.steer : 0; });
    this.place(v, dt);
    if (Math.hypot(v.pos.x - ox, v.pos.z - oz) > 0.001) v.settle = true;
  },
};
