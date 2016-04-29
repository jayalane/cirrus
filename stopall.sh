#! /bin/bash


nc localhost 8001 <<EOF
process.exit()
EOF

nc localhost 9001 <<EOF
process.exit()
EOF

nc localhost 10001 <<EOF
process.exit()
EOF



for a in rm1 rm2 rm3 ; do
    >/tmp/$a.out
    >/tmp/$a.err
    node main.js $a >> /tmp/$a.out 2>> /tmp/$a.err &
done

sleep 6;

nc localhost 9001 <<EOF
ll('DEBUG2')
lls('stdout', 'DEBUG2')
ld(false)
EOF

nc localhost 10001 <<EOF
ll('DEBUG2')
lls('stdout', 'DEBUG2')
ld(false)
EOF

nc localhost 8001 <<EOF
ll('DEBUG2')
lls('stdout', 'DEBUG2')
ld(false)
trigger_test()
EOF

