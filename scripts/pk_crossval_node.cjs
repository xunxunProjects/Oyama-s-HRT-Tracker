'use strict';
const math = require(process.argv[2]);

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
    data += chunk;
});
process.stdin.on('end', () => {
    const cases = JSON.parse(data);
    const out = cases.map(c => ({
        d1: math._expDivDiff1(c.x, c.y, c.tau),
        d2: math._expDivDiff2(c.a, c.b, c.c, c.tau),
        a2: math._analytic2C(c.tau, c.D, c.F, c.ka, c.ke),
        a3: math._analytic3C(c.tau, c.D, c.F, c.k1, c.k2, c.k3),
    }));
    process.stdout.write(JSON.stringify(out));
});
