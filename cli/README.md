how to use:
add
```
# Job Tracker CLI
jt() {
  (
    cd /[PATH_TO_PROJECT]/job-tracker &&
    /[PATH_TO_PROJECT]/job-tracker/.venv/bin/python -m cli "$@"
  )
}
```
to your bash profile
