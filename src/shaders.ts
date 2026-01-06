export const vertexShader = `
attribute vec2 a_position;
attribute vec2 a_textureCoords;

uniform vec2 u_resolution;

uniform vec2 u_scale;
uniform vec2 u_rotation;
uniform vec2 u_translation;

varying vec2 v_textureCoords;

void main() {
  v_textureCoords = a_textureCoords;

  vec2 centeredPosition = a_position - vec2(0.5);
  vec2 scaledPosition = centeredPosition * u_scale;
  vec2 rotatedPosition = vec2(
    scaledPosition.x * u_rotation.x - scaledPosition.y * u_rotation.y,
    scaledPosition.x * u_rotation.y + scaledPosition.y * u_rotation.x
  );
  vec2 translatedPosition = rotatedPosition + u_translation + u_scale * 0.5;
  vec2 normalizedPosition = translatedPosition / u_resolution;
  vec2 clipSpacePosition = normalizedPosition * 2.0 - 1.0;

  gl_Position = vec4(clipSpacePosition * vec2(1.0, -1.0), 0.0, 1.0);
}
`;

export const fragmentShader = `
precision mediump float;

uniform sampler2D u_texture;
uniform float u_opacity;

varying vec2 v_textureCoords;

void main() {
  vec4 color = texture2D(u_texture, v_textureCoords);
  gl_FragColor = vec4(color.rgb, color.a * u_opacity);
}
`;
