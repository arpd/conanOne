#/usr/bin/env sh

set -xe

CONAN_USER_HOME=$(readlink -f $PWD)/conan-env conan create -pr:h macos-armv8-clang16-dbg -pr:b macos-armv8-clang16-dbg .
