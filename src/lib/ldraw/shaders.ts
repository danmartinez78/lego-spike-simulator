export const lego_vertex_shader = `
      // an attribute will receive data from a buffer
      attribute vec4 a_vertex;
      attribute vec4 a_colour;
      uniform mat4 model_matrix;
      uniform mat4 projection_matrix;
      uniform float brightness;
      varying vec4 v_colour;
      varying vec4 v;
      varying vec3 v_eye;
     
      // all shaders have a main function
      void main() {
     
        // gl_Position is a special variable a vertex shader
        // is responsible for setting
        v_colour = vec4(a_colour.rgb * brightness, a_colour.a);
        vec4 eye = model_matrix * a_vertex;
        v_eye = eye.xyz;
        v = projection_matrix * eye;
        gl_Position = v;
      }
      `;

export const lego_fragment_shader = `
      // Depth needs more than mediump, which is 16 bit on many
      // Chromebook GPUs.
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform float near;
      uniform float far;
      varying vec4 v_colour;
      varying vec4 v;
      uniform bool renderDepth;

      // Store depth as 16 bits, high byte in red and low byte in green, so
      // the distance sensor isn't limited to 256 steps. Readers that only
      // look at red still get the old 8 bit value.
      vec4 packDepth(float depth) {
        float scaled = clamp(depth, 0.0, 1.0) * 255.0;
        float high = floor(scaled);
        float low = min(floor((scaled - high) * 256.0), 255.0);
        return vec4(high / 255.0, low / 255.0, 0.0, 1.0);
      }
     
      void main() {
        // gl_FragColor is a special variable a fragment shader
        // is responsible for setting
        if (renderDepth) {
            float depth = (v.z - near) / (far - near);
            gl_FragColor = packDepth(depth);
        } else {
            gl_FragColor = vec4(v_colour.rgb, 1.0);
        }
        // gl_FragDepth is used to specify the depth value
        // it is taken from gl_FragCoord.z by default
      }
`;

export const lego_fragment_shader_df = `#extension GL_OES_standard_derivatives : enable
      // Depth needs more than mediump, which is 16 bit on many
      // Chromebook GPUs.
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform float near;
      uniform float far;
      varying vec4 v_colour;
      varying vec4 v;
      uniform bool renderDepth;
      uniform bool lighting;
      varying vec3 v_eye;

      // Store depth as 16 bits, high byte in red and low byte in green, so
      // the distance sensor isn't limited to 256 steps. Readers that only
      // look at red still get the old 8 bit value.
      vec4 packDepth(float depth) {
        float scaled = clamp(depth, 0.0, 1.0) * 255.0;
        float high = floor(scaled);
        float low = min(floor((scaled - high) * 256.0), 255.0);
        return vec4(high / 255.0, low / 255.0, 0.0, 1.0);
      }
     
      void main() {
        // gl_FragColor is a special variable a fragment shader
        // is responsible for setting
        if (renderDepth) {
            float depth = (v.z - near) / (far - near);
            float angle1 = dFdx(v).z;
            float angle2 = dFdy(v).z;
            float angle = abs(angle1) + abs(angle2);
            if (angle > 10.0) {
                gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
            } else {
                gl_FragColor = packDepth(depth);
            }
        } else if (lighting) {
            // Flat shading from the face's own slope, so no normals are
            // needed in the vertex data. Lit from above and to the left of
            // the camera, from both sides since LDraw winding varies.
            vec3 normal = normalize(cross(dFdx(v_eye), dFdy(v_eye)));
            if (normal.z < 0.0) {
                normal = -normal;
            }
            vec3 light = normalize(vec3(-0.4, 0.8, 0.6));
            float shade = 0.55 + 0.45 * max(dot(normal, light), 0.0);
            gl_FragColor = vec4(v_colour.rgb * shade, 1.0);
        } else {
            gl_FragColor = vec4(v_colour.rgb, 1.0);
        }
        // gl_FragDepth is used to specify the depth value
        // it is taken from gl_FragCoord.z by default
      }
`;

export const map_vertex_shader = `
      // an attribute will receive data from a buffer
      attribute vec4 a_vertex;
      attribute vec2 a_texture;
      uniform mat4 model_matrix;
      uniform mat4 projection_matrix;
      varying highp vec2 v_texture;
     
      // all shaders have a main function
      void main() {
     
        // gl_Position is a special variable a vertex shader
        // is responsible for setting
        v_texture = a_texture;
        gl_Position = projection_matrix * model_matrix * a_vertex;
      }
      `;

export const map_fragment_shader = `
      // fragment shaders don't have a default precision so we need
      // to pick one. mediump is a good default
      precision mediump float;
      varying highp vec2 v_texture;
      uniform sampler2D sampler;
      uniform float brightness;
     
      void main() {
        // gl_FragColor is a special variable a fragment shader
        // is responsible for setting
        vec4 colour = texture2D(sampler, v_texture);
        // store the depth in the alpha channel
        gl_FragColor = vec4(colour.rgb * brightness, gl_FragCoord.z);
      }
`;
