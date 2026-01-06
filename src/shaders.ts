export const vertexShader = `
precision mediump float;

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

uniform vec2 u_scale;
uniform float u_opacity;
uniform float u_blur;
uniform float u_brightness;
uniform float u_contrast;

uniform sampler2D u_texture;

varying vec2 v_textureCoords;

void main() {
  vec4 color = texture2D(u_texture, v_textureCoords);

  if (u_blur > 0.0) {
    vec2 texel = vec2(u_blur / u_scale.x, u_blur / u_scale.y);
    vec4 sum = color * 4.0;

    sum += texture2D(u_texture, v_textureCoords + vec2(texel.x, 0.0));
    sum += texture2D(u_texture, v_textureCoords + vec2(-texel.x, 0.0));
    sum += texture2D(u_texture, v_textureCoords + vec2(0.0, texel.y));
    sum += texture2D(u_texture, v_textureCoords + vec2(0.0, -texel.y));

    sum += texture2D(u_texture, v_textureCoords + vec2(texel.x, texel.y));
    sum += texture2D(u_texture, v_textureCoords + vec2(-texel.x, texel.y));
    sum += texture2D(u_texture, v_textureCoords + vec2(texel.x, -texel.y));
    sum += texture2D(u_texture, v_textureCoords + vec2(-texel.x, -texel.y));

    color = sum / 12.0;
  }

  vec3 adjustedColor = color.rgb * u_brightness;
  adjustedColor = (adjustedColor - 0.5) * u_contrast + 0.5;
  adjustedColor = clamp(adjustedColor, 0.0, 1.0);

  gl_FragColor = vec4(adjustedColor, color.a * u_opacity);
}
`;
